const docx = require('docx');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  PageOrientation,
  ShadingType
} = docx;
const { db } = require('./database');
const { compareUsersByPositionAndName } = require('./userSorting');

// Standard cell border style
const blackBorder = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '000000'
};

const cellBorders = {
  top: blackBorder,
  bottom: blackBorder,
  left: blackBorder,
  right: blackBorder
};

const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'auto'
};

const transparentBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder
};

function getSystemConfigs() {
  try {
    const configs = db.prepare('SELECT key, value FROM system_configs').all();
    const dict = {};
    configs.forEach(c => { dict[c.key] = c.value; });
    return dict;
  } catch (e) {
    return {};
  }
}

function formatDateVN(val, fallback = '—') {
  if (!val) return fallback;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  const str = String(val).trim();
  const parts = str.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return str;
}

function formatAdministrativeDate(date = new Date(), location = '') {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const dateStr = `ngày ${day} tháng ${month} năm ${year}`;
  return location ? `${location}, ${dateStr}` : dateStr;
}

/**
 * 1. EXPORT MẪU 01-A (CBQL) / MẪU 01-B (CBNV) TO WORD (.DOCX)
 */
async function exportCBQLDocx(periodId, userId) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId);
  const user = db.prepare(`
    SELECT u.*, d.name as dept_name, d.parent_agency, d.location_name,
           d.manager_title, d.leader_title,
           u_leader.full_name as dept_leader_name
    FROM users u 
    LEFT JOIN departments d ON u.dept_id = d.id 
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE u.id = ?
  `).get(userId);

  if (!period || !user) {
    throw new Error('Không tìm thấy thông tin kỳ đánh giá hoặc cán bộ');
  }

  const sysConfigs = getSystemConfigs();
  const parentAgency = user.parent_agency || sysConfigs.PARENT_AGENCY_NAME || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH';
  const unitName = user.dept_name ? user.dept_name.toUpperCase() : (sysConfigs.UNIT_NAME || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH');
  const locationName = user.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = user.dept_leader_name || sysConfigs.LEADER_SIGNER_NAME || '';
  const leaderTitle = user.leader_title || sysConfigs.LEADER_SIGNER_TITLE || 'THỦ TRƯỞNG ĐƠN VỊ';

  const isCbnv = (user.target_role === 'cbnv') || (user.role === 'cbnv' && user.target_role !== 'cbql');
  const roleFilter = isCbnv ? 'cbnv' : 'cbql';
  const mauCode = isCbnv ? 'Mẫu 01-B' : 'Mẫu 01-A';

  // Fetch assigned tasks
  const tasks = db.prepare(`
    SELECT t.*, a.name as axis_name 
    FROM assigned_tasks t
    LEFT JOIN axes a ON t.axis_code = a.code
    WHERE t.period_id = ? AND t.user_id = ?
    ORDER BY t.axis_code ASC, t.created_at ASC
  `).all(periodId, userId);

  // Fetch evaluation
  const evaluation = db.prepare('SELECT * FROM evaluations WHERE period_id = ? AND user_id = ?').get(periodId, userId) || {
    part1_score: 0,
    part2_score: 0,
    bonus_score: 0,
    total_score: 0,
    rank_proposed: 'Chưa tự đánh giá',
    superior_rank: null,
    superior_comment: ''
  };

  // Fetch criteria
  const criteriaList = db.prepare(`
    SELECT c.*, COALESCE(d.is_satisfied, 1) as is_satisfied, COALESCE(d.score, c.max_score) as score, d.note
    FROM common_criteria c
    LEFT JOIN evaluation_criteria_details d ON c.id = d.criteria_id AND d.evaluation_id = ?
    WHERE c.target_role = 'all' OR c.target_role = ? OR c.target_role IS NULL
    ORDER BY c.code ASC
  `).all(evaluation.id || '', roleFilter);

  // Group criteria
  const group1Criteria = criteriaList.filter(c => c.category === 'chinh_tri_dao_duc' || (c.code && c.code.startsWith('1.')));
  const group2Criteria = criteriaList.filter(c => c.category === 'ky_cuong_ky_luat' || (c.code && c.code.startsWith('2.')));
  const group3Criteria = criteriaList.filter(c => c.category === 'trach_nhiem_tac_phong' || (c.code && c.code.startsWith('3.')));
  const group4Criteria = criteriaList.filter(c => c.category === 'hoc_tap_sang_tao' || (c.code && c.code.startsWith('4.')));

  // Score calculations
  let planTotalA = 0;
  let execTotalB = 0;
  let bonusTotal = 0;

  tasks.forEach(t => {
    const std = t.standard_score || 10;
    const diff = t.difficulty_weight || 1.0;
    planTotalA += Number((std * diff).toFixed(2));
    execTotalB += Number((t.converted_score || 0).toFixed(2));
    if (t.is_bonus_approved) {
      bonusTotal += Number((t.bonus_score || ((t.converted_score || 0) * 0.05)).toFixed(2));
    }
  });

  const part1Score = evaluation.part1_score !== undefined && evaluation.part1_score !== null ? evaluation.part1_score : 30;
  const part2Score = evaluation.part2_score !== undefined && evaluation.part2_score !== null 
    ? evaluation.part2_score 
    : (planTotalA > 0 ? Number(Math.min(70.0, 70.0 * (execTotalB / planTotalA)).toFixed(2)) : 0);
  const bonusScore = evaluation.bonus_score !== undefined && evaluation.bonus_score !== null 
    ? evaluation.bonus_score 
    : Number(Math.min(7.0, bonusTotal).toFixed(2));
  const totalScore = evaluation.total_score !== undefined && evaluation.total_score !== null
    ? evaluation.total_score
    : Number(Math.min(105.0, part1Score + part2Score + bonusScore).toFixed(2));

  // Build document elements
  const children = [];

  // 1. Header Row (Mẫu 01-A/B on right top corner)
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({ text: mauCode, bold: true, size: 28, font: 'Times New Roman' })
      ]
    })
  );

  // 2. Agency (left) & National Header (right)
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({ text: parentAgency.toUpperCase(), size: 24, font: 'Times New Roman' })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: unitName, bold: true, size: 26, font: 'Times New Roman' })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: '————————', size: 20, font: 'Times New Roman' })
                ]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({ text: 'ĐẢNG CỘNG SẢN VIỆT NAM', bold: true, size: 26, font: 'Times New Roman' })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: formatAdministrativeDate(new Date(), locationName), italics: true, size: 26, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(headerTable);

  // 3. Document Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 60 },
      children: [
        new TextRun({ text: 'BẢN TỰ ĐÁNH GIÁ, XẾP LOẠI CỦA CÁ NHÂN', bold: true, size: 32, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ 
          text: isCbnv 
            ? '(Dành cho công chức, viên chức không giữ chức vụ lãnh đạo, quản lý)' 
            : '(Dành cho cán bộ lãnh đạo, quản lý)', 
          italics: true, 
          bold: true,
          size: 26, 
          font: 'Times New Roman' 
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: period.name || 'Quý III/2026', italics: true, size: 26, font: 'Times New Roman' })
      ]
    })
  );

  // 4. Cadre Information
  const cadreTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 60, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: 'Họ và tên: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.full_name || '', size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 40, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: 'Ngày sinh: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: formatDateVN(user.birth_date, '10/04/1973'), size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            columnSpan: 2,
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: 'Chức vụ Đảng: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.party_title || (user.is_party_member ? 'Đảng viên' : 'Quần chúng'), size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            columnSpan: 2,
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: 'Chức vụ / Vị trí việc làm: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.gov_title || (isCbnv ? 'Chuyên viên' : 'Lãnh đạo'), size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            columnSpan: 2,
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({ text: 'Chức vụ đoàn thể: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.union_title || 'Không có', size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            columnSpan: 2,
            children: [
              new Paragraph({
                spacing: { after: 160 },
                children: [
                  new TextRun({ text: 'Đơn vị công tác: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.dept_name || unitName, size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(cadreTable);

  // 5. Section I: Tự đánh giá
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({ text: 'I. Tự đánh giá kết quả thực hiện nhiệm vụ', bold: true, size: 28, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ 
          text: 'Trên cơ sở nhiệm vụ được giao, cá nhân tự đánh giá về kết quả thực hiện nhiệm vụ theo quý như sau:', 
          italics: true, 
          size: 26, 
          font: 'Times New Roman' 
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 60, after: 120 },
      children: [
        new TextRun({ text: 'A. NHÓM TIÊU CHÍ CHUNG (30 ĐIỂM)', bold: true, size: 28, font: 'Times New Roman' })
      ]
    })
  );

  // 6. Criteria Table (17 tiêu chuẩn)
  const cellPadding = { top: 70, bottom: 70, left: 100, right: 100 };
  const thShading = { fill: 'F1F5F9', type: ShadingType.CLEAR };
  const groupShading = { fill: 'E2E8F0', type: ShadingType.CLEAR };

  function makeHeaderCell(text, widthPct) {
    return new TableCell({
      borders: cellBorders,
      shading: thShading,
      margins: cellPadding,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, size: 22, font: 'Times New Roman' })]
        })
      ]
    });
  }

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('TT', 6),
        makeHeaderCell('Tiêu chí / Nội dung', 44),
        makeHeaderCell('Đảm bảo\n(x)', 10),
        makeHeaderCell('Không đảm bảo\n(x)', 12),
        makeHeaderCell('Điểm tối đa', 10),
        makeHeaderCell('Điểm đạt', 10),
        makeHeaderCell('Ghi chú', 8)
      ]
    })
  ];

  function addGroupRows(groupTitle, items, groupIndex) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            shading: groupShading,
            margins: cellPadding,
            columnSpan: 7,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${groupIndex}. ${groupTitle}`, bold: true, size: 22, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      })
    );

    items.forEach((item, idx) => {
      const isSat = item.is_satisfied === 1 || item.is_satisfied === true;
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: String(idx + 1), size: 22, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: item.name || '', size: 22, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: isSat ? 'x' : '', bold: true, size: 24, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: !isSat ? 'x' : '', bold: true, size: 24, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: String(item.max_score || 0), size: 22, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: String(item.score !== undefined ? item.score : (isSat ? item.max_score : 0)), bold: true, size: 22, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: item.note || '', size: 20, font: 'Times New Roman' })]
                })
              ]
            })
          ]
        })
      );
    });
  }

  addGroupRows('Về phẩm chất chính trị, đạo đức, lối sống, thực hiện trách nhiệm nêu gương', group1Criteria, 1);
  addGroupRows('Về thực hiện kỷ cương, kỷ luật và chấp hành quy định cơ quan', group2Criteria, 2);
  addGroupRows('Về tinh thần trách nhiệm, thái độ phục vụ và phối hợp công tác', group3Criteria, 3);
  addGroupRows('Về học tập nâng cao trình độ, năng lực công tác và đổi mới sáng tạo', group4Criteria, 4);

  // Total criteria row
  tableRows.push(
    new TableRow({
      children: [
        new TableCell({
          borders: cellBorders,
          shading: groupShading,
          margins: cellPadding,
          columnSpan: 4,
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: 'TỔNG ĐIỂM NHÓM TIÊU CHÍ CHUNG (A):', bold: true, size: 22, font: 'Times New Roman' })
              ]
            })
          ]
        }),
        new TableCell({
          borders: cellBorders,
          shading: groupShading,
          margins: cellPadding,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: '30', bold: true, size: 22, font: 'Times New Roman' })]
            })
          ]
        }),
        new TableCell({
          borders: cellBorders,
          shading: groupShading,
          margins: cellPadding,
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(part1Score), bold: true, size: 24, font: 'Times New Roman' })]
            })
          ]
        }),
        new TableCell({
          borders: cellBorders,
          shading: groupShading,
          margins: cellPadding,
          children: [new Paragraph({})]
        })
      ]
    })
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    })
  );

  // 7. Section B: Kết quả công việc (70 điểm)
  children.push(
    new Paragraph({
      spacing: { before: 180, after: 120 },
      children: [
        new TextRun({ text: 'B. KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO (70 ĐIỂM) & ĐIỂM THƯỞNG (+5%)', bold: true, size: 28, font: 'Times New Roman' })
      ]
    })
  );

  // Summary of Part B
  const partBTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            shading: thShading,
            margins: cellPadding,
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Chỉ số đánh giá công việc (theo Hướng dẫn 06-HD/BTCTU)', bold: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: cellBorders,
            shading: thShading,
            margins: cellPadding,
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Kết quả đạt được', bold: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                children: [new TextRun({ text: '1. Tổng điểm công việc theo kế hoạch ban đầu (A):', size: 22, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${planTotalA.toFixed(2)} điểm`, size: 22, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                children: [new TextRun({ text: '2. Tổng điểm thực hiện công việc thực tế đạt được (B):', size: 22, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${execTotalB.toFixed(2)} điểm`, size: 22, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                children: [new TextRun({ text: '3. Điểm quy đổi công việc thực hiện (tối đa 70 điểm):', bold: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${part2Score.toFixed(2)} / 70 điểm`, bold: true, size: 24, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                children: [new TextRun({ text: '4. Điểm thưởng hoàn thành vượt tiến độ / chất lượng xuất sắc (+5%):', size: 22, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: cellBorders,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `+${bonusScore.toFixed(2)} điểm`, bold: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            shading: groupShading,
            margins: cellPadding,
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'TỔNG ĐIỂM NHÓM KẾT QUẢ CÔNG VIỆC & THƯỞNG (B):', bold: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: cellBorders,
            shading: groupShading,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${(part2Score + bonusScore).toFixed(2)} / 70 điểm`, bold: true, size: 24, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(partBTable);

  // 8. Tasks Table in the Period
  children.push(
    new Paragraph({
      spacing: { before: 140, after: 80 },
      children: [
        new TextRun({ text: `* Danh mục nhiệm vụ, sản phẩm công việc thực hiện trong quý (${tasks.length} nhiệm vụ):`, bold: true, italics: true, size: 24, font: 'Times New Roman' })
      ]
    })
  );

  const taskTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('STT', 5),
        makeHeaderCell('Tên nhiệm vụ / Sản phẩm công việc', 37),
        makeHeaderCell('Trục KQ', 10),
        makeHeaderCell('Độ PT', 8),
        makeHeaderCell('Điểm chuẩn', 10),
        makeHeaderCell('Tiến độ', 10),
        makeHeaderCell('Chất lượng', 10),
        makeHeaderCell('Điểm QĐ', 10)
      ]
    })
  ];

  if (tasks.length === 0) {
    taskTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            columnSpan: 8,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Chưa có nhiệm vụ công việc nào được ghi nhận trong kỳ này.', italics: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    );
  } else {
    tasks.forEach((t, i) => {
      taskTableRows.push(
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), size: 20, font: 'Times New Roman' })] })]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: t.task_name || '', size: 20, font: 'Times New Roman' })]
                })
              ]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.axis_code || '', size: 18, font: 'Times New Roman' })] })]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(t.difficulty_weight || 1.0), size: 20, font: 'Times New Roman' })] })]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(t.standard_score || 10), size: 20, font: 'Times New Roman' })] })]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.progress_score !== null && t.progress_score !== undefined ? `${t.progress_score}%` : '—', size: 20, font: 'Times New Roman' })] })]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.quality_score !== null && t.quality_score !== undefined ? `${t.quality_score}%` : '—', size: 20, font: 'Times New Roman' })] })]
            }),
            new TableCell({
              borders: cellBorders,
              margins: cellPadding,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(t.converted_score || 0).toFixed(2), bold: true, size: 20, font: 'Times New Roman' })] })]
            })
          ]
        })
      );
    });
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: taskTableRows
    })
  );

  // 9. Overall Score & Proposed Rank
  children.push(
    new Paragraph({
      spacing: { before: 180, after: 80 },
      children: [
        new TextRun({ text: 'TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ VÀ XẾP LOẠI:', bold: true, size: 28, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: '• Tổng điểm đạt được (A + B): ', bold: true, size: 28, font: 'Times New Roman' }),
        new TextRun({ text: `${totalScore.toFixed(2)} / 100 điểm `, bold: true, size: 30, font: 'Times New Roman' }),
        new TextRun({ text: `(Phần A: ${part1Score}đ + Phần B: ${part2Score.toFixed(2)}đ + Thưởng: ${bonusScore.toFixed(2)}đ)`, italics: true, size: 24, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({ text: '• Cá nhân tự đề xuất mức xếp loại: ', bold: true, size: 28, font: 'Times New Roman' }),
        new TextRun({ text: evaluation.rank_proposed || 'Chưa tự đánh giá', bold: true, size: 28, font: 'Times New Roman' })
      ]
    })
  );

  // 10. Section II: Nhận xét cấp có thẩm quyền
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 80 },
      children: [
        new TextRun({ text: 'II. Nhận xét, đánh giá của cấp có thẩm quyền', bold: true, size: 28, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: '1. Ý kiến nhận xét của Cấp quản lý trực tiếp:', bold: true, size: 26, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ 
          text: evaluation.superior_comment || 'Ưu điểm: Hoàn thành tốt các nhiệm vụ chuyên môn được giao đúng tiến độ, chất lượng đảm bảo. Chấp hành nghiêm chỉnh nội quy, quy chế cơ quan. Khuyết điểm: Cần tiếp tục chủ động hơn trong công tác tham mưu.', 
          italics: !evaluation.superior_comment, 
          size: 26, 
          font: 'Times New Roman' 
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: '2. Mức xếp loại chất lượng do Thủ trưởng / Cấp quản lý đề xuất:', bold: true, size: 26, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 220 },
      children: [
        new TextRun({ text: `=> ${evaluation.superior_rank || evaluation.rank_proposed || 'Hoàn thành tốt nhiệm vụ'}`, bold: true, size: 28, font: 'Times New Roman' })
      ]
    })
  );

  // 11. Signatures
  const signTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: leaderTitle.toUpperCase(), bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({ spacing: { before: 1200 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: leaderName || '', bold: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'NGƯỜI TỰ ĐÁNH GIÁ', bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({ spacing: { before: 1200 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: user.full_name || '', bold: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(signTable);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 28, // 14pt default
            color: '000000'
          },
          paragraph: {
            spacing: { line: 280, before: 40, after: 40 }
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 1134, bottom: 1134, left: 1440, right: 1134 } // A4 standard margins
        }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 2. EXPORT BÁO CÁO THỰC HIỆN CÔNG VIỆC TO WORD (.DOCX)
 */
async function exportTasksDocx(periodId, userId) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId);
  const user = db.prepare(`
    SELECT u.*, d.name as dept_name, d.parent_agency, d.location_name,
           d.manager_title, d.leader_title,
           u_leader.full_name as dept_leader_name
    FROM users u 
    LEFT JOIN departments d ON u.dept_id = d.id 
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE u.id = ?
  `).get(userId);

  if (!period || !user) {
    throw new Error('Không tìm thấy thông tin kỳ đánh giá hoặc cán bộ');
  }

  const sysConfigs = getSystemConfigs();
  const parentAgency = user.parent_agency || sysConfigs.PARENT_AGENCY_NAME || 'THÀNH ỦY THÀNH PHỐ HỒ CHÍ MINH';
  const unitName = user.dept_name ? user.dept_name.toUpperCase() : (sysConfigs.UNIT_NAME || 'BAN TỔ CHỨC THÀNH ỦY TP. HỒ CHÍ MINH');
  const locationName = user.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = user.dept_leader_name || sysConfigs.LEADER_SIGNER_NAME || '';
  const leaderTitle = user.leader_title || sysConfigs.LEADER_SIGNER_TITLE || 'THỦ TRƯỞNG ĐƠN VỊ';

  const tasks = db.prepare(`
    SELECT t.*, a.name as axis_name 
    FROM assigned_tasks t
    LEFT JOIN axes a ON t.axis_code = a.code
    WHERE t.period_id = ? AND t.user_id = ?
    ORDER BY t.axis_code ASC, t.created_at ASC
  `).all(periodId, userId);

  const axes = db.prepare('SELECT * FROM axes ORDER BY code ASC').all();

  const children = [];

  // Header Table
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({ text: parentAgency.toUpperCase(), size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [new TextRun({ text: unitName, bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [new TextRun({ text: '————————', size: 20, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({ text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({ text: 'Độc lập - Tự do - Hạnh phúc', bold: true, underline: {}, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [new TextRun({ text: formatAdministrativeDate(new Date(), locationName), italics: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(headerTable);

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 60 },
      children: [
        new TextRun({ text: 'BÁO CÁO KẾT QUẢ THỰC HIỆN NHIỆM VỤ, SẢN PHẨM CÔNG VIỆC', bold: true, size: 30, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [
        new TextRun({ text: period.name || 'Quý III/2026', italics: true, size: 26, font: 'Times New Roman' })
      ]
    })
  );

  // Cadre Info Table
  const cadreTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: 'Họ và tên: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.full_name || '', size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: 'Vị trí công tác: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.gov_title || 'Chuyên viên', size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            columnSpan: 2,
            children: [
              new Paragraph({
                spacing: { after: 140 },
                children: [
                  new TextRun({ text: 'Đơn vị / Phòng ban: ', bold: true, size: 28, font: 'Times New Roman' }),
                  new TextRun({ text: user.dept_name || unitName, size: 28, font: 'Times New Roman' })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(cadreTable);

  // Tasks table by 6 axes
  const cellPadding = { top: 70, bottom: 70, left: 90, right: 90 };
  const thShading = { fill: 'F1F5F9', type: ShadingType.CLEAR };
  const groupShading = { fill: 'E2E8F0', type: ShadingType.CLEAR };

  function makeHeaderCell(text, widthPct) {
    return new TableCell({
      borders: cellBorders,
      shading: thShading,
      margins: cellPadding,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, size: 22, font: 'Times New Roman' })]
        })
      ]
    });
  }

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeHeaderCell('STT', 5),
        makeHeaderCell('Tên nhiệm vụ / Sản phẩm công việc', 37),
        makeHeaderCell('Loại việc', 10),
        makeHeaderCell('Hạn HT', 10),
        makeHeaderCell('Tiến độ', 8),
        makeHeaderCell('Chất lượng', 8),
        makeHeaderCell('Điểm QĐ', 10),
        makeHeaderCell('Trạng thái', 12)
      ]
    })
  ];

  let taskStt = 0;
  let totalConverted = 0;
  let totalBonus = 0;

  axes.forEach((axis, axIdx) => {
    const axisTasks = tasks.filter(t => t.axis_code === axis.code);
    if (axisTasks.length > 0) {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              borders: cellBorders,
              shading: groupShading,
              margins: cellPadding,
              columnSpan: 8,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: `TRỤC ${axIdx + 1}: ${axis.name.toUpperCase()} (${axisTasks.length} nhiệm vụ)`, bold: true, size: 22, font: 'Times New Roman' })
                  ]
                })
              ]
            })
          ]
        })
      );

      axisTasks.forEach(t => {
        taskStt += 1;
        totalConverted += (t.converted_score || 0);
        if (t.is_bonus_approved) totalBonus += (t.bonus_score || ((t.converted_score || 0) * 0.05));

        const statusMap = {
          'completed': 'Hoàn thành',
          'in_progress': 'Đang thực hiện',
          'pending': 'Chờ thực hiện',
          'overdue': 'Chậm tiến độ'
        };

        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(taskStt), size: 20, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                children: [new Paragraph({ children: [new TextRun({ text: t.task_name || '', size: 20, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.task_type || 'Thường xuyên', size: 18, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatDateVN(t.due_date, '—'), size: 18, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.progress_score !== null && t.progress_score !== undefined ? `${t.progress_score}%` : '—', size: 18, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.quality_score !== null && t.quality_score !== undefined ? `${t.quality_score}%` : '—', size: 18, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: Number(t.converted_score || 0).toFixed(2), bold: true, size: 20, font: 'Times New Roman' })] })]
              }),
              new TableCell({
                borders: cellBorders,
                margins: cellPadding,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: statusMap[t.status] || t.status || 'Đã nộp', size: 18, font: 'Times New Roman' })] })]
              })
            ]
          })
        );
      });
    }
  });

  if (taskStt === 0) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            columnSpan: 8,
            margins: cellPadding,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Không có nhiệm vụ nào trong kỳ này.', italics: true, size: 22, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    );
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    })
  );

  // Summary & Signatures
  children.push(
    new Paragraph({
      spacing: { before: 180, after: 60 },
      children: [
        new TextRun({ text: `• Tổng số nhiệm vụ thực hiện: ${taskStt} nhiệm vụ.`, bold: true, size: 28, font: 'Times New Roman' })
      ]
    }),
    new Paragraph({
      spacing: { after: 180 },
      children: [
        new TextRun({ text: `• Tổng điểm quy đổi công việc: ${totalConverted.toFixed(2)} điểm. Điểm thưởng: +${totalBonus.toFixed(2)} điểm.`, bold: true, size: 28, font: 'Times New Roman' })
      ]
    })
  );

  const signTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: leaderTitle.toUpperCase(), bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({ spacing: { before: 1200 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: leaderName || '', bold: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'NGƯỜI BÁO CÁO', bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({ spacing: { before: 1200 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: user.full_name || '', bold: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(signTable);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 28,
            color: '000000'
          },
          paragraph: {
            spacing: { line: 280, before: 40, after: 40 }
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 1134, bottom: 1134, left: 1440, right: 1134 }
        }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

/**
 * 3. EXPORT MẪU 02 (BÁO CÁO TỔNG HỢP TOÀN CƠ QUAN) TO WORD (.DOCX) - LANDSCAPE A4
 */
async function exportMau02Docx(periodId) {
  const period = db.prepare('SELECT * FROM periods WHERE id = ?').get(periodId) || { name: 'Quý III/2026', id: periodId };

  const sysConfigs = getSystemConfigs();
  // Tìm đơn vị đang được đánh giá (đơn vị có cán bộ nhân viên trong đợt đánh giá)
  const evalDept = db.prepare(`
    SELECT d.id, d.parent_id, d.parent_agency, d.location_name, d.name, d.leader_title, d.manager_title,
           u_leader.full_name as leader_name,
           count(u.id) as active_user_count
    FROM departments d
    JOIN users u ON u.dept_id = d.id AND u.is_active = 1
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE d.is_active = 1
      AND u.role NOT IN ('admin', 'admin_donvi')
    GROUP BY d.id
    ORDER BY active_user_count DESC
    LIMIT 1
  `).get() || db.prepare(`
    SELECT d.id, d.parent_id, d.parent_agency, d.location_name, d.name, d.leader_title, d.manager_title,
           u_leader.full_name as leader_name
    FROM departments d
    LEFT JOIN users u_leader ON d.leader_id = u_leader.id
    WHERE d.is_active = 1
    ORDER BY d.parent_id IS NOT NULL DESC, d.code ASC LIMIT 1
  `).get();

  const parentDept = evalDept?.parent_id ? db.prepare('SELECT name FROM departments WHERE id = ?').get(evalDept.parent_id) : null;
  const parentAgency = (evalDept?.parent_agency && evalDept.parent_agency.trim().toLowerCase() !== evalDept.name?.trim().toLowerCase())
    ? evalDept.parent_agency
    : (parentDept?.name || sysConfigs.PARENT_AGENCY_NAME || 'ĐẢNG BỘ CẤP TRÊN');
  const unitName = evalDept?.name ? evalDept.name.toUpperCase() : (sysConfigs.UNIT_NAME || 'ĐƠN VỊ ĐÁNH GIÁ');
  const locationName = evalDept?.location_name || sysConfigs.LOCATION_NAME || 'TP. Hồ Chí Minh';
  const leaderName = evalDept?.leader_name || sysConfigs.LEADER_SIGNER_NAME || '';
  const leaderTitle = evalDept?.leader_title || sysConfigs.LEADER_SIGNER_TITLE || 'THỦ TRƯỞNG ĐƠN VỊ';

  const rows = db.prepare(`
    SELECT u.id as user_id, u.full_name, u.role, u.target_role, u.management_role, u.party_title, u.gov_title, u.union_title, d.name as dept_name,
           COALESCE(u.employee_type, 'vien_chuc') as employee_type,
           e.id as evaluation_id, e.step, e.part1_score, e.part2_score, e.bonus_score, e.total_score,
           e.rank_proposed, e.superior_rank, e.summary_reason, e.cadre_proposal_note, e.superior_comment
    FROM users u
    LEFT JOIN departments d ON u.dept_id = d.id
    LEFT JOIN evaluations e ON e.user_id = u.id AND e.period_id = ?
    WHERE u.is_active = 1 
      AND u.role NOT IN ('admin', 'admin_donvi')
      AND COALESCE(u.target_role, '') NOT IN ('admin', 'admin_donvi', 'none', 'exempt')
      AND COALESCE(u.role_id, '') NOT IN ('role-admin', 'role-admin-donvi')
    ORDER BY u.role DESC, u.full_name ASC
  `).all(periodId);
  rows.sort(compareUsersByPositionAndName);

  // Group by employee_type
  const congChucList = rows.filter(r => r.employee_type === 'cong_chuc');
  const vienChucList = rows.filter(r => r.employee_type === 'vien_chuc');
  const laoDongList = rows.filter(r => r.employee_type === 'lao_dong');

  function calculateGroupStats(items) {
    const total = items.length;
    let exc = 0, good = 0, complete = 0, fail = 0;
    items.forEach(r => {
      const finalRank = r.superior_rank || r.rank_proposed || '';
      if (finalRank.includes('xuất sắc') || finalRank.includes('Xuat sac') || finalRank.includes('Xuất sắc')) exc++;
      else if (finalRank.includes('tốt') || finalRank.includes('Tot') || finalRank.includes('Tốt')) good++;
      else if (finalRank.includes('không hoàn thành') || finalRank.includes('Khong hoan thanh')) fail++;
      else if (finalRank.includes('hoàn thành') || finalRank.includes('Hoan thanh')) complete++;
    });
    const excPercent = total > 0 ? ((exc / total) * 100).toFixed(1) : '0.0';
    const goodPercent = total > 0 ? ((good / total) * 100).toFixed(1) : '0.0';
    const completePercent = total > 0 ? ((complete / total) * 100).toFixed(1) : '0.0';
    const failPercent = total > 0 ? ((fail / total) * 100).toFixed(1) : '0.0';
    const isExcExceeded = total > 0 && (exc / total) > 0.2001;
    return { total, exc, excPercent, good, goodPercent, complete, completePercent, fail, failPercent, isExcExceeded };
  }

  const congChucStats = calculateGroupStats(congChucList);
  const vienChucStats = calculateGroupStats(vienChucList);
  const laoDongStats = calculateGroupStats(laoDongList);
  const totalStats = calculateGroupStats(rows);

  const children = [];

  // Header Table (Landscape)
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({ text: parentAgency.toUpperCase(), size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [new TextRun({ text: unitName, bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [new TextRun({ text: '————————', size: 20, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 55, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 40 },
                children: [new TextRun({ text: 'Mẫu 02 (HD 06-HD/BTCTU)', bold: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({ text: 'ĐẢNG CỘNG SẢN VIỆT NAM', bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [new TextRun({ text: formatAdministrativeDate(new Date(), locationName), italics: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(headerTable);

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 140, after: 60 },
      children: [
        new TextRun({ 
          text: 'BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI CÁN BỘ, CÔNG CHỨC, VIÊN CHỨC, NGƯỜI LAO ĐỘNG HÀNG QUÝ', 
          bold: true, 
          size: 28, 
          font: 'Times New Roman' 
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({ text: period.name || 'Quý III/2026', italics: true, size: 26, font: 'Times New Roman' })
      ]
    })
  );

  // Table 13 columns (widths in percentage totaling 100%)
  const colWidths = [3, 14, 13, 10, 6, 6, 6, 6, 9, 9, 8, 5, 5];
  const cellPadding = { top: 60, bottom: 60, left: 70, right: 70 };
  const thShading = { fill: 'F1F5F9', type: ShadingType.CLEAR };
  const groupShading = { fill: 'E2E8F0', type: ShadingType.CLEAR };

  function makeTh(text, widthPct) {
    return new TableCell({
      borders: cellBorders,
      shading: thShading,
      margins: cellPadding,
      verticalAlign: VerticalAlign.CENTER,
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, size: 19, font: 'Times New Roman' })]
        })
      ]
    });
  }

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeTh('STT', colWidths[0]),
        makeTh('Họ và tên', colWidths[1]),
        makeTh('Chức vụ / Vị trí', colWidths[2]),
        makeTh('Đơn vị', colWidths[3]),
        makeTh('Phần A\n(30đ)', colWidths[4]),
        makeTh('Phần B\n(70đ)', colWidths[5]),
        makeTh('Điểm\nthưởng', colWidths[6]),
        makeTh('Tổng\nđiểm', colWidths[7]),
        makeTh('Cá nhân\ntự ĐX', colWidths[8]),
        makeTh('Lãnh đạo\nđề xuất', colWidths[9]),
        makeTh('Tóm tắt lý do', colWidths[10]),
        makeTh('Đề xuất\ncán bộ', colWidths[11]),
        makeTh('Ghi\nchú', colWidths[12])
      ]
    })
  ];

  let currentStt = 0;

  function renderGroupRows(groupTitle, items, stats) {
    if (items.length === 0) return;

    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorders,
            shading: groupShading,
            margins: cellPadding,
            columnSpan: 13,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: `${groupTitle} (${items.length} đồng chí — HTXSNV: ${stats.exc}/${stats.total} đạt ${stats.excPercent}%)`, 
                    bold: true, 
                    size: 20, 
                    font: 'Times New Roman' 
                  })
                ]
              })
            ]
          })
        ]
      })
    );

    items.forEach(r => {
      currentStt += 1;
      const part1 = r.part1_score !== undefined && r.part1_score !== null ? Number(r.part1_score).toFixed(1) : '—';
      const part2 = r.part2_score !== undefined && r.part2_score !== null ? Number(r.part2_score).toFixed(1) : '—';
      const bonus = r.bonus_score ? `+${Number(r.bonus_score).toFixed(1)}` : '—';
      const total = r.total_score !== undefined && r.total_score !== null ? Number(r.total_score).toFixed(1) : '—';

      tableRows.push(
        new TableRow({
          children: [
            new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(currentStt), size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.full_name || '', bold: true, size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.gov_title || 'Chuyên viên', size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.dept_name || '', size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: part1, size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: part2, size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: bonus, size: 18, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: total, bold: true, size: 19, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.rank_proposed || 'Chưa tự ĐX', size: 17, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.superior_rank || r.rank_proposed || 'Chưa có', bold: true, size: 17, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.summary_reason || '', size: 16, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: r.cadre_proposal_note || '', size: 16, font: 'Times New Roman' })] })] }),
            new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: '', size: 16, font: 'Times New Roman' })] })] })
          ]
        })
      );
    });
  }

  const romanNumerals = ['I', 'II', 'III'];
  let grpIdx = 0;
  if (congChucList.length > 0) renderGroupRows(`${romanNumerals[grpIdx++]}. KHỐI CÔNG CHỨC`, congChucList, congChucStats);
  if (vienChucList.length > 0) renderGroupRows(`${romanNumerals[grpIdx++]}. KHỐI VIÊN CHỨC`, vienChucList, vienChucStats);
  if (laoDongList.length > 0) renderGroupRows(`${romanNumerals[grpIdx++]}. KHỐI NGƯỜI LAO ĐỘNG`, laoDongList, laoDongStats);

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows
    })
  );

  // Thống kê tỷ lệ xếp loại theo khối đối tượng (Kiểm tra trần 20%)
  children.push(
    new Paragraph({
      spacing: { before: 180, after: 80 },
      children: [
        new TextRun({ text: '* BẢNG TỔNG HỢP TỶ LỆ XẾP LOẠI THEO TỪNG KHỐI ĐỐI TƯỢNG (QUY ĐỊNH HTXSNV ≤ 20%):', bold: true, size: 24, font: 'Times New Roman' })
      ]
    })
  );

  const statTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        makeTh('Khối đối tượng', 22),
        makeTh('Tổng số', 10),
        makeTh('Hoàn thành XSNV', 14),
        makeTh('Tỷ lệ XSNV', 12),
        makeTh('Hoàn thành TNV', 14),
        makeTh('Hoàn thành NV', 14),
        makeTh('Không HTNV', 14)
      ]
    })
  ];

  function addStatRow(title, stats, isBold = false) {
    statTableRows.push(
      new TableRow({
        children: [
          new TableCell({ borders: cellBorders, margins: cellPadding, children: [new Paragraph({ children: [new TextRun({ text: title, bold: isBold, size: 19, font: 'Times New Roman' })] })] }),
          new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(stats.total), bold: isBold, size: 19, font: 'Times New Roman' })] })] }),
          new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(stats.exc), bold: isBold, size: 19, font: 'Times New Roman' })] })] }),
          new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${stats.excPercent}%`, bold: true, size: 19, font: 'Times New Roman' })] })] }),
          new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${stats.good} (${stats.goodPercent}%)`, size: 18, font: 'Times New Roman' })] })] }),
          new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${stats.complete} (${stats.completePercent}%)`, size: 18, font: 'Times New Roman' })] })] }),
          new TableCell({ borders: cellBorders, margins: cellPadding, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${stats.fail} (${stats.failPercent}%)`, size: 18, font: 'Times New Roman' })] })] })
        ]
      })
    );
  }

  let statIdx = 1;
  if (congChucStats.total > 0) addStatRow(`${statIdx++}. Khối Công chức`, congChucStats);
  if (vienChucStats.total > 0) addStatRow(`${statIdx++}. Khối Viên chức`, vienChucStats);
  if (laoDongStats.total > 0) addStatRow(`${statIdx++}. Khối Người lao động`, laoDongStats);
  addStatRow('TOÀN CƠ QUAN / ĐƠN VỊ', totalStats, true);

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: statTableRows
    })
  );

  // Signatures
  const signTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: transparentBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'NGƯỜI LẬP BIỂU', bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({ spacing: { before: 1400 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '', bold: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          }),
          new TableCell({
            borders: transparentBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: leaderTitle.toUpperCase(), bold: true, size: 26, font: 'Times New Roman' })]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ký, đóng dấu, ghi rõ họ tên)', italics: true, size: 24, font: 'Times New Roman' })]
              }),
              new Paragraph({ spacing: { before: 1400 } }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: leaderName || '', bold: true, size: 26, font: 'Times New Roman' })]
              })
            ]
          })
        ]
      })
    ]
  });
  children.push(signTable);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 26,
            color: '000000'
          },
          paragraph: {
            spacing: { line: 260, before: 30, after: 30 }
          }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 900, bottom: 900, left: 900, right: 900 }
        }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

module.exports = {
  exportCBQLDocx,
  exportTasksDocx,
  exportMau02Docx
};
