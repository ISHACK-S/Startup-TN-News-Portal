import { asyncHandler } from '../middleware/async-handler.js';
import {
  getAdminActivityDetails,
  getMonthlyActivityExport,
  getMonthlyActivityReport
} from '../services/admin-activity.service.js';

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(report) {
  const lines = [
    ['Monthly Administrative Activity Report', `${report.month}/${report.year}`],
    ['Generated at', new Date().toISOString()],
    [],
    ['Summary', 'Count'],
    ['Total activities', report.summary.totalActivities],
    ['Active administrators', report.summary.activeAdministrators],
    ['Content actions', report.summary.contentActions],
    ['Account actions', report.summary.accountActions],
    ['Website changes', report.summary.websiteChanges],
    ['Security events', report.summary.securityEvents],
    [],
    ['Administrator breakdown'],
    ['Administrator', 'Email', 'Historical role', 'Actions', 'Most recent activity'],
    ...report.administrators.map((item) => [
      item.administratorName, item.email, item.role, item.actions, item.mostRecentActivity
    ]),
    [],
    ['Module breakdown', 'Count'],
    ...report.modules.map((item) => [item.module, item.total]),
    [],
    ['Action breakdown', 'Count'],
    ...report.actions.map((item) => [item.action, item.total]),
    [],
    ['Activities'],
    ['Date/time', 'Administrator', 'Email', 'Role at time', 'Module', 'Action', 'Description', 'Record ID', 'Status', 'Changes'],
    ...report.activities.data.map((item) => [
      item.occurredAt,
      item.administratorName,
      item.email,
      item.role,
      item.module,
      item.action,
      item.description,
      item.recordId,
      item.status,
      item.changes ? JSON.stringify(item.changes) : ''
    ]),
    ...(report.activities.pagination.truncated
      ? [[], ['Export truncated at 10,000 activity records.']]
      : [])
  ];
  return `\uFEFF${lines.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

function pdfEscape(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

function createPdf(lines) {
  const wrappedLines = lines.flatMap((line) => {
    const safeLine = pdfEscape(line);
    if (safeLine.length <= 110) return [safeLine];
    const wrapped = [];
    let remaining = safeLine;
    while (remaining.length > 110) {
      let splitAt = remaining.lastIndexOf(' ', 110);
      if (splitAt < 1) splitAt = 110;
      wrapped.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    wrapped.push(remaining);
    return wrapped;
  });
  const pages = [];
  for (let index = 0; index < wrappedLines.length; index += 55) {
    pages.push(wrappedLines.slice(index, index + 55));
  }
  if (!pages.length) pages.push([]);
  const objects = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands = ['BT', '/F1 9 Tf', '45 755 Td', '12 TL'];
    page.forEach((line, lineIndex) => {
      if (lineIndex) commands.push('T*');
      commands.push(`(${line}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(document);
    document += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    document += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'binary');
}

function pdfLines(report) {
  return [
    `Monthly Administrative Activity Report - ${report.month}/${report.year}`,
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Total activities: ${report.summary.totalActivities}`,
    `Active administrators: ${report.summary.activeAdministrators}`,
    `Content actions: ${report.summary.contentActions}`,
    `Account actions: ${report.summary.accountActions}`,
    `Website changes: ${report.summary.websiteChanges}`,
    `Security events: ${report.summary.securityEvents}`,
    '',
    'Administrator breakdown:'
  ].concat(
    report.administrators.map((item) =>
      `${item.administratorName} | ${item.email} | ${item.role} | ${item.actions} actions | ${item.mostRecentActivity}`
    ),
    ['', 'Module breakdown:'],
    report.modules.map((item) => `${item.module}: ${item.total}`),
    ['', 'Action breakdown:'],
    report.actions.map((item) => `${item.action}: ${item.total}`),
    ['', 'Detailed activities:'],
    report.activities.data.map((item) =>
      `${item.occurredAt} | ${item.administratorName} | ${item.role} | ${item.module} | ${item.action} | ${item.status} | ${item.description}${item.changes ? ` | ${JSON.stringify(item.changes)}` : ''}`
    ),
    report.activities.pagination.truncated ? ['', 'Export truncated at 10,000 activity records.'] : []
  );
}

export const monthlyActivityReportController = asyncHandler(async (request, response) => {
  const report = await getMonthlyActivityReport(request.validated.query, request.app.locals.database);
  response.status(200).json({ data: report });
});

export const adminActivityDetailsController = asyncHandler(async (request, response) => {
  const activity = await getAdminActivityDetails(
    request.validated.params.activityId,
    request.app.locals.database
  );
  response.status(200).json({ data: activity });
});

export const exportMonthlyActivityCsvController = asyncHandler(async (request, response) => {
  const report = await getMonthlyActivityExport(request.validated.query, request.app.locals.database);
  response.type('text/csv; charset=utf-8');
  response.set('Content-Disposition', `attachment; filename="admin-activity-${report.year}-${String(report.month).padStart(2, '0')}.csv"`);
  response.status(200).send(buildCsv(report));
});

export const exportMonthlyActivityPdfController = asyncHandler(async (request, response) => {
  const report = await getMonthlyActivityExport(request.validated.query, request.app.locals.database);
  response.type('application/pdf');
  response.set('Content-Disposition', `attachment; filename="admin-activity-${report.year}-${String(report.month).padStart(2, '0')}.pdf"`);
  response.status(200).send(createPdf(pdfLines(report)));
});

export { buildCsv, createPdf, pdfLines };
