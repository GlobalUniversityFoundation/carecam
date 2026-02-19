"use client";

type CategoryName =
  | "Aggression"
  | "Disruptive Behaviors"
  | "Motor Stereotypy"
  | "Vocal Stereotypy"
  | "Avoidance & Escape Behaviors";

type TrendPoint = {
  date: string;
  counts: Record<CategoryName, number>;
  total: number;
};

type BehaviorLogRow = {
  timestamp: string;
  behavior: string;
  details: string;
};

type ExportReportPayload = {
  childName: string;
  age: string;
  diagnosis: string;
  therapistName: string;
  sessionDate: string;
  durationText: string;
  sessionId: string;
  reviewNotes: string;
  totalBehaviorInstances: number;
  dominantCategory: string;
  aiDetectedCount: number;
  therapistReviewedCount: number;
  sessionComparison: {
    changePercent: number;
    label: string;
    baselineSessionCount: number;
  } | null;
  trend: TrendPoint[];
  currentCategoryCounts: Record<CategoryName, number>;
  behaviorByCategory: Record<CategoryName, Record<string, number>>;
  behaviorLog: BehaviorLogRow[];
};

type ExportResponse = {
  report?: ExportReportPayload;
  message?: string;
};

const CATEGORY_ORDER: CategoryName[] = [
  "Aggression",
  "Disruptive Behaviors",
  "Motor Stereotypy",
  "Vocal Stereotypy",
  "Avoidance & Escape Behaviors",
];

const CATEGORY_COLORS: Record<CategoryName, [number, number, number]> = {
  Aggression: [37, 99, 235],
  "Disruptive Behaviors": [249, 115, 22],
  "Motor Stereotypy": [147, 51, 234],
  "Vocal Stereotypy": [16, 185, 129],
  "Avoidance & Escape Behaviors": [239, 68, 68],
};

type DrawCardDoc = {
  setDrawColor: (r: number, g: number, b: number) => unknown;
  setFillColor: (r: number, g: number, b: number) => unknown;
  roundedRect: (
    x: number,
    y: number,
    w: number,
    h: number,
    rx: number,
    ry: number,
    style?: "S" | "F" | "FD" | "DF",
  ) => unknown;
};

function drawCard(doc: DrawCardDoc, x: number, y: number, w: number, h: number, fill?: [number, number, number]) {
  doc.setDrawColor(226, 232, 240);
  if (fill) {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.roundedRect(x, y, w, h, 6, 6, "FD");
  } else {
    doc.roundedRect(x, y, w, h, 6, 6, "S");
  }
}

export async function exportSessionReportPdf(icd: string, uploadEpoch: string) {
  const res = await fetch(
    `/api/children/export-report?icd=${encodeURIComponent(icd)}&uploadEpoch=${encodeURIComponent(uploadEpoch)}`,
    { cache: "no-store" },
  );
  const payload = (await res.json().catch(() => ({}))) as ExportResponse;
  if (!res.ok || !payload.report) {
    throw new Error(payload.message || "Failed to export report.");
  }
  const report = payload.report;

  const { jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default as unknown as (
    doc: unknown,
    options: Record<string, unknown>,
  ) => void;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 38;
  const contentWidth = pageWidth - margin * 2;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), "F");

  const fitSingleLine = (text: string, maxWidth: number) => {
    const safe = String(text || "");
    if (doc.getTextWidth(safe) <= maxWidth) return safe;
    const ellipsis = "...";
    let trimmed = safe;
    while (trimmed.length > 0 && doc.getTextWidth(`${trimmed}${ellipsis}`) > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}${ellipsis}`;
  };

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("Behavior Analysis Report", margin, 60);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(11);
  doc.text("Child Therapy Session - AI-Assisted Review", margin, 78);

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 96, pageWidth - margin, 96);

  drawCard(doc, margin, 108, contentWidth, 70);
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text(report.childName, margin + 12, 136);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Age: ${report.age} years`, margin + 12, 152);
  doc.text(`Diagnosis: ${report.diagnosis}`, margin + 12, 168);

  doc.setTextColor(30, 41, 59);
  doc.text("Session Date", margin + contentWidth - 170, 130);
  doc.setFont("helvetica", "bold");
  doc.text(report.sessionDate, margin + contentWidth - 170, 146);
  doc.setFont("helvetica", "normal");
  doc.text("Duration", margin + contentWidth - 60, 130);
  doc.setFont("helvetica", "bold");
  doc.text(report.durationText, margin + contentWidth - 60, 146);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  const rightMetaLeftX = margin + contentWidth - 170;
  const rightMetaRightX = margin + contentWidth - 12;
  const therapistText = fitSingleLine(`Therapist: ${report.therapistName}`, rightMetaRightX - rightMetaLeftX);
  doc.text(therapistText, rightMetaLeftX, 162);
  doc.text(`Session ID: ${report.sessionId}`, rightMetaLeftX, 174);

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Session Summary", margin, 214);

  const cardY = 226;
  const gap = 8;
  const cardCount = report.sessionComparison ? 4 : 3;
  const cardW = (contentWidth - gap * (cardCount - 1)) / cardCount;
  const cardH = 58;

  drawCard(doc, margin, cardY, cardW, cardH, [248, 250, 252]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Total Behavior Instances", margin + 10, cardY + 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text(String(report.totalBehaviorInstances), margin + 10, cardY + 45);

  drawCard(doc, margin + cardW + gap, cardY, cardW, cardH, [239, 246, 255]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Dominant Behavior", margin + cardW + gap + 10, cardY + 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(29, 78, 216);
  doc.text(report.dominantCategory, margin + cardW + gap + 10, cardY + 40);

  const thirdX = margin + (cardW + gap) * 2;
  drawCard(doc, thirdX, cardY, cardW, cardH, [248, 250, 252]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("AI vs Therapist Review", thirdX + 10, cardY + 18);
  doc.setTextColor(37, 99, 235);
  doc.setFontSize(10);
  doc.text(`AI Detected: ${report.aiDetectedCount}`, thirdX + 10, cardY + 36);
  doc.setTextColor(5, 150, 105);
  doc.text(`Therapist Reviewed: ${report.therapistReviewedCount}`, thirdX + 10, cardY + 50);

  if (report.sessionComparison) {
    const fourthX = margin + (cardW + gap) * 3;
    drawCard(doc, fourthX, cardY, cardW, cardH, [248, 250, 252]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Compared to last ${report.sessionComparison.baselineSessionCount} sessions`, fourthX + 10, cardY + 18, {
      maxWidth: cardW - 20,
    });
    doc.setFont("helvetica", "bold");
    doc.setTextColor(report.sessionComparison.changePercent >= 0 ? 5 : 220, report.sessionComparison.changePercent >= 0 ? 150 : 38, report.sessionComparison.changePercent >= 0 ? 105 : 38);
    const sign = report.sessionComparison.changePercent >= 0 ? "+" : "";
    doc.text(`${sign}${report.sessionComparison.changePercent}%`, fourthX + 10, cardY + 38);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(report.sessionComparison.label, fourthX + 10, cardY + 50, { maxWidth: cardW - 20 });
  }

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Behavior Category Trend Over Time", margin, 312);

  drawCard(doc, margin, 324, contentWidth, 214, [255, 255, 255]);
  const chartX = margin + 24;
  const chartY = 368;
  const chartW = contentWidth - 48;
  const chartH = 130;
  doc.setDrawColor(203, 213, 225);
  doc.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  doc.line(chartX, chartY, chartX, chartY + chartH);

  const trend = report.trend.slice(-8);
  const maxY = Math.max(
    1,
    ...trend.map((point) => CATEGORY_ORDER.reduce((sum, key) => Math.max(sum, point.counts[key] || 0), 0)),
  );
  const xStep = trend.length > 1 ? chartW / (trend.length - 1) : chartW;
  const yFor = (value: number) => chartY + chartH - (value / maxY) * (chartH - 10);

  CATEGORY_ORDER.forEach((category) => {
    const [r, g, b] = CATEGORY_COLORS[category];
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(1.2);
    let prev: { x: number; y: number } | null = null;
    trend.forEach((point, idx) => {
      const x = chartX + idx * xStep;
      const y = yFor(point.counts[category] || 0);
      if (prev) doc.line(prev.x, prev.y, x, y);
      doc.setFillColor(r, g, b);
      doc.circle(x, y, 1.8, "F");
      prev = { x, y };
    });
  });

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  trend.forEach((point, idx) => {
    const x = chartX + idx * xStep;
    doc.text(point.date, x, chartY + chartH + 14, { align: "center" });
  });

  let legendX = chartX;
  let legendY = chartY + chartH + 34;
  CATEGORY_ORDER.forEach((category) => {
    const [r, g, b] = CATEGORY_COLORS[category];
    doc.setFillColor(r, g, b);
    doc.circle(legendX, legendY - 2, 2.2, "F");
    doc.setTextColor(r, g, b);
    doc.setFontSize(8);
    doc.text(category, legendX + 6, legendY);
    legendX += 90;
    if (legendX > chartX + chartW - 95) {
      legendX = chartX;
      legendY += 14;
    }
  });

  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Behavior Breakdown - This Session", margin, 572);

  const breakdownY = 584;
  const breakdownGap = 8;
  const breakdownW = (contentWidth - breakdownGap * 4) / 5;
  const breakdownH = 74;
  CATEGORY_ORDER.forEach((category, idx) => {
    const x = margin + idx * (breakdownW + breakdownGap);
    drawCard(doc, x, breakdownY, breakdownW, breakdownH, [255, 255, 255]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(17, 24, 39);
    doc.text(category, x + 8, breakdownY + 16, { maxWidth: breakdownW - 35 });
    doc.setFontSize(22);
    const [r, g, b] = CATEGORY_COLORS[category];
    doc.setTextColor(r, g, b);
    doc.text(String(report.currentCategoryCounts[category] || 0), x + breakdownW - 16, breakdownY + 25, {
      align: "right",
    });
    const topItems = Object.entries(report.behaviorByCategory[category] || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    topItems.forEach((item, itemIdx) => {
      doc.text(`${item[0]}  ${item[1]}`, x + 8, breakdownY + 42 + itemIdx * 12, {
        maxWidth: breakdownW - 16,
      });
    });
  });

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), "F");
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Behavior Log", margin, 54);

  autoTable(doc, {
    startY: 66,
    margin: { left: margin, right: margin },
    head: [["Timestamp", "Behavior", "Details"]],
    body: report.behaviorLog.map((row) => [row.timestamp, row.behavior, row.details]),
    styles: {
      fontSize: 9,
      cellPadding: 6,
      textColor: [31, 41, 55],
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 140 },
      2: { cellWidth: contentWidth - 232 },
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
  });

  const finalY = Number((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 360);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("Therapist Notes (Observation)", margin, finalY + 32);
  drawCard(doc, margin, finalY + 42, contentWidth, 140, [239, 246, 255]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(
    report.reviewNotes.trim() || "No therapist notes were added for this session.",
    margin + 12,
    finalY + 62,
    {
      maxWidth: contentWidth - 24,
      lineHeightFactor: 1.4,
    },
  );

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 760, pageWidth - margin, 760);
  doc.setTextColor(234, 88, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Important Disclaimer", margin, 782);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    "This report is intended to support therapy planning and should be interpreted by a qualified professional.",
    margin,
    797,
  );
  doc.setTextColor(107, 114, 128);
  doc.text("Generated by AI + Therapist Review", pageWidth / 2 - 72, 820);

  doc.save(`behavior-analysis-report-${icd}-${uploadEpoch}.pdf`);
}


