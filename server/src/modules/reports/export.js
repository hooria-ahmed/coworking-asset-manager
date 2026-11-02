// Report files: CSV and PDF (FR-RP-05). Owner: Misbah.
// Each report type is described once (title, columns, rows) and rendered to either format.
const PDFDocument = require('pdfkit');
const { getUsage, getMaintenance, getAiActivity, maintenanceRecords, assetRegister, aiLogRecords } = require('./queries');

const CURRENCY = 'Rs';
// Neon Noir colours (docs/UI_TEMPLATE.md), on a white page so reports print well.
const INK = '#141418'; // near-black title band and table header
const VIOLET = '#7438f0'; // electric violet: headings, key figures
const LIME = '#c6f24e'; // lime: one accent line under the title band
const TEXT = '#1c1c22';
const MUTED = '#6b6b78';
const BORDER = '#e4e2ec';
const STRIPE = '#f6f3ff'; // faint violet row stripe

const money = (n) => `${CURRENCY} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
const dateTime = (v) => (v ? String(v).slice(0, 16) : '');

// ---------- Report definitions ----------
// Each returns { title, subtitle, filename, highlights: [[label, value]], sections: [{ heading, columns, rows }] }.
// columns: [{ header, value(row), width (relative), align? }]. The first section is the one exported to CSV.

async function usageReport(period) {
  const usage = await getUsage(period, { limit: 0 });
  const r = usage.requests;
  return {
    title: 'Asset Usage Report',
    subtitle: `Period: ${period.from} to ${period.to}`,
    filename: `usage-report_${period.from}_to_${period.to}`,
    highlights: [
      ['Borrowings', usage.totalBorrowings],
      ['Assets used', usage.mostUsed.length],
      ['Requests made', Object.values(r).reduce((a, b) => a + b, 0)],
      ['Approved / completed', r.Approved + r.Completed],
      ['Rejected', r.Rejected],
    ],
    sections: [
      {
        heading: 'Most-used assets',
        empty: 'No assets were borrowed in this period.',
        columns: [
          { header: 'Rank', value: (x, i) => i + 1, width: 0.6, align: 'right' },
          { header: 'Asset tag', value: (x) => x.asset_tag, width: 1.2 },
          { header: 'Asset', value: (x) => x.name, width: 2.6 },
          { header: 'Category', value: (x) => x.category, width: 1.8 },
          { header: 'Times borrowed', value: (x) => x.times, width: 1.2, align: 'right' },
          { header: 'Days in use', value: (x) => x.days, width: 1.1, align: 'right' },
        ],
        rows: usage.mostUsed,
      },
      {
        heading: 'Usage by category',
        columns: [
          { header: 'Category', value: (x) => x.category, width: 3 },
          { header: 'Times borrowed', value: (x) => x.times, width: 1.2, align: 'right' },
          {
            header: 'Share',
            value: (x) => (usage.totalBorrowings ? `${Math.round((x.times / usage.totalBorrowings) * 100)}%` : '0%'),
            width: 1, align: 'right',
          },
        ],
        rows: usage.byCategory,
      },
    ],
  };
}

async function maintenanceReport(period) {
  const [summary, records] = await Promise.all([getMaintenance(period), maintenanceRecords(period)]);
  return {
    title: 'Maintenance Report',
    subtitle: `Period: ${period.from} to ${period.to}`,
    filename: `maintenance-report_${period.from}_to_${period.to}`,
    landscape: true,
    highlights: [
      ['Records', summary.total],
      ['Open / in progress', summary.open],
      ['Closed', summary.closed],
      ['Repaired', summary.repaired],
      ['Retired', summary.retired],
      ['Total cost', money(summary.totalCost)],
    ],
    sections: [
      {
        heading: 'Maintenance records',
        empty: 'No maintenance was reported in this period.',
        columns: [
          { header: 'ID', value: (x) => x.maintenance_id, width: 0.5, align: 'right' },
          { header: 'Asset tag', value: (x) => x.asset_tag, width: 0.9 },
          { header: 'Asset', value: (x) => x.asset_name, width: 1.6 },
          { header: 'Issue', value: (x) => x.issue_description, width: 2.8 },
          { header: 'Status', value: (x) => x.status, width: 0.9 },
          { header: 'Outcome', value: (x) => x.outcome || '', width: 0.8 },
          { header: `Cost (${CURRENCY})`, value: (x) => Number(x.cost).toFixed(2), width: 0.9, align: 'right' },
          { header: 'Reported by', value: (x) => x.reported_by, width: 1.2 },
          { header: 'Reported', value: (x) => dateTime(x.reported_at), width: 1.2 },
          { header: 'Resolved', value: (x) => dateTime(x.resolved_at), width: 1.2 },
        ],
        rows: records,
      },
    ],
  };
}

async function assetsReport() {
  const rows = await assetRegister();
  const count = (status) => rows.filter((r) => r.status === status).length;
  const today = dateOnly(new Date().toISOString());
  return {
    title: 'Asset Register',
    subtitle: 'All assets and their current status',
    filename: `asset-register_${today}`,
    highlights: [
      ['Total assets', rows.length],
      ['Available', count('Available')],
      ['Reserved', count('Reserved')],
      ['Borrowed', count('Borrowed')],
      ['Under maintenance', count('Under Maintenance')],
      ['Retired', count('Retired')],
    ],
    sections: [
      {
        heading: 'Assets',
        empty: 'There are no assets yet.',
        columns: [
          { header: 'Asset tag', value: (x) => x.asset_tag, width: 1 },
          { header: 'Name', value: (x) => x.name, width: 2.2 },
          { header: 'Category', value: (x) => x.category, width: 1.4 },
          { header: 'Location', value: (x) => x.location, width: 1.8 },
          { header: 'Condition', value: (x) => x.condition, width: 0.9 },
          { header: 'Status', value: (x) => x.status, width: 1.2 },
          { header: 'Added on', value: (x) => dateOnly(x.added_on), width: 1 },
        ],
        rows,
      },
    ],
  };
}

async function aiReport(period) {
  const [summary, rows] = await Promise.all([getAiActivity(period), aiLogRecords(period)]);
  return {
    title: 'AI Activity Report',
    subtitle: `Period: ${period.from} to ${period.to}`,
    filename: `ai-activity-report_${period.from}_to_${period.to}`,
    landscape: true,
    highlights: [
      ['AI requests', summary.total],
      ['Assistant questions', summary.byFeature.Assistant],
      ['Recommendations', summary.byFeature.Recommendation],
      ['Ranked by AI', summary.recommendationSource.ai],
      ['Rule-based', summary.recommendationSource.rules],
      ['Users', summary.activeUsers],
    ],
    sections: [
      {
        heading: 'Questions and answers',
        empty: 'Nobody used the AI features in this period.',
        columns: [
          { header: 'When', value: (x) => dateTime(x.created_at), width: 1.1 },
          { header: 'User', value: (x) => `${x.user_name} (${x.role})`, width: 1.4 },
          { header: 'Feature', value: (x) => (x.source ? `${x.feature} (${x.source})` : x.feature), width: 1.2 },
          { header: 'Question or need', value: (x) => x.prompt.replace(/\s+/g, ' '), width: 3 },
          { header: 'Answer', value: (x) => x.answer.replace(/\s+/g, ' ').slice(0, 600), width: 3.6 },
        ],
        rows,
      },
    ],
  };
}

const REPORTS = { usage: usageReport, maintenance: maintenanceReport, assets: assetsReport, ai: aiReport };

// ---------- CSV ----------

// A cell starting with = + - @ (or tab / carriage return) is run as a formula by Excel and
// LibreOffice (CSV injection). Text cells like that get a leading ' so they show as plain text;
// plain numbers (including negatives) are left alone.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v !== 'number' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(report) {
  const { columns, rows } = report.sections[0];
  const lines = [
    columns.map((c) => csvCell(c.header)).join(','),
    ...rows.map((row, i) => columns.map((c) => csvCell(c.value(row, i))).join(',')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel reads the file as UTF-8
}

// ---------- PDF ----------

function toPdf(report, generatedBy) {
  const doc = new PDFDocument({
    size: 'A4', layout: report.landscape ? 'landscape' : 'portrait', margin: 40, bufferPages: true,
    info: { Title: report.title, Author: 'Co-Working Asset Manager' },
  });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

  // Title band: near-black with a violet orb and a lime accent line
  doc.rect(0, 0, doc.page.width, 78).fill(INK);
  doc.circle(doc.page.width - doc.page.margins.right - 18, 39, 16).fill(VIOLET);
  doc.circle(doc.page.width - doc.page.margins.right - 12, 33, 5).fill(LIME);
  doc.rect(0, 78, doc.page.width, 3).fill(LIME);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(report.title, left, 22, { width: width - 50 });
  doc.font('Helvetica').fontSize(10).fillColor('#a9a9b8').text('AI-Powered Co-Working Space Asset Manager', left, 46, { width: width - 50 });
  doc.y = 96;
  doc.fillColor(MUTED).fontSize(9.5)
    .text(`${report.subtitle}   |   Generated ${dateTime(new Date().toISOString()).replace('T', ' ')} UTC by ${generatedBy}`, left, doc.y, { width });
  doc.moveDown(1);

  // Key figures as small boxes
  const n = report.highlights.length;
  const gap = 8;
  const boxW = (width - gap * (n - 1)) / n;
  const boxY = doc.y;
  report.highlights.forEach(([label, value], i) => {
    const x = left + i * (boxW + gap);
    doc.roundedRect(x, boxY, boxW, 46, 10).lineWidth(0.8).strokeColor(BORDER).stroke();
    doc.fillColor(VIOLET).font('Helvetica-Bold').fontSize(14).text(String(value), x + 8, boxY + 8, { width: boxW - 16, lineBreak: false, ellipsis: true });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, x + 8, boxY + 29, { width: boxW - 16, lineBreak: false, ellipsis: true });
  });
  doc.y = boxY + 64;

  for (const section of report.sections) {
    if (doc.y + 60 > bottom()) doc.addPage();
    doc.circle(left + 3, doc.y + 6, 3).fill(VIOLET);
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(12).text(section.heading, left + 12, doc.y, { width: width - 12 });
    doc.moveDown(0.4);
    drawTable(doc, section, left, width, bottom);
    doc.moveDown(1.2);
  }

  // Footer with page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - doc.page.margins.bottom - 8;
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(report.title, left, y, { width: width / 2, lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, left + width / 2, y, { width: width / 2, align: 'right', lineBreak: false });
  }
  doc.end();
  return doc;
}

function drawTable(doc, section, left, width, bottom) {
  const total = section.columns.reduce((a, c) => a + c.width, 0);
  const cols = section.columns.map((c) => ({ ...c, w: (c.width / total) * width }));
  const pad = 4;
  const fontSize = 8.5;

  const header = () => {
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const h = Math.max(...cols.map((c) => doc.heightOfString(c.header, { width: c.w - pad * 2 }))) + pad * 2;
    doc.rect(left, doc.y, width, h).fill(INK);
    let x = left;
    const y = doc.y;
    for (const c of cols) {
      doc.fillColor('#ffffff').text(c.header, x + pad, y + pad, { width: c.w - pad * 2, align: c.align || 'left' });
      x += c.w;
    }
    doc.y = y + h;
  };

  if (!section.rows.length) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9.5).text(section.empty || 'No data.', left, doc.y, { width });
    return;
  }
  header();
  doc.font('Helvetica').fontSize(fontSize);
  section.rows.forEach((row, i) => {
    const cells = cols.map((c) => String(c.value(row, i) ?? ''));
    const h = Math.max(...cells.map((t, j) => doc.heightOfString(t, { width: cols[j].w - pad * 2 }))) + pad * 2;
    if (doc.y + h > bottom()) {
      doc.addPage();
      header();
      doc.font('Helvetica').fontSize(fontSize);
    }
    const y = doc.y;
    if (i % 2 === 1) doc.rect(left, y, width, h).fill(STRIPE);
    let x = left;
    cells.forEach((t, j) => {
      doc.fillColor(TEXT).text(t, x + pad, y + pad, { width: cols[j].w - pad * 2, align: cols[j].align || 'left' });
      x += cols[j].w;
    });
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.y = y + h;
  });
}

module.exports = { REPORTS, toCsv, toPdf };
