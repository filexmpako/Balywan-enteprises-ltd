import { jsPDF } from 'jspdf';
import { KPIMetric } from '../types';
import { getCompanyName } from './company';
import { formatDateTime } from './dateFormat';
import { getActivityRules } from './activityRules';

/**
 * Helper to identify if a KPI name is monetary
 */
const isMonetaryKPI = (kpiName: string): boolean => {
  const name = String(kpiName || '').toLowerCase();
  return name.includes('value') || name.includes('servicing') || name.includes('liquidity') || name.includes('float') || name.includes('revenue') || name.includes('profit') || name.includes('commission');
};

/**
 * Format a number/string to full layout without abbreviation
 */
const formatFullNumber = (val: number | string | undefined, isMonetary: boolean = false): string => {
  if (val === undefined || val === null) return '0';
  
  let numVal: number;
  if (typeof val === 'number') {
    numVal = val;
  } else {
    const str = String(val).trim().toUpperCase();
    if (str.endsWith('B')) {
      numVal = parseFloat(str.replace(/[^0-9.-]/g, '')) * 1000000000;
    } else if (str.endsWith('M')) {
      numVal = parseFloat(str.replace(/[^0-9.-]/g, '')) * 1000000;
    } else if (str.endsWith('K')) {
      numVal = parseFloat(str.replace(/[^0-9.-]/g, '')) * 1000;
    } else {
      numVal = parseFloat(str.replace(/[^0-9.-]/g, ''));
    }
  }

  if (isNaN(numVal)) return String(val);

  const integerVal = Math.round(numVal);
  const formatted = integerVal.toLocaleString('en-US');

  if (isMonetary) {
    return `TZS ${formatted}`;
  }
  return formatted;
};

/**
 * Normalizes any status string into our core KPI status set.
 */
const normalizeStatus = (statusStr: string, performance?: number | string): 'ON TRACK' | 'ACHIEVED' | 'NEEDS ATTENTION' | 'CRITICAL' => {
  const s = String(statusStr || '').trim().toUpperCase();
  if (s.includes('ACHIEVED') || s.includes('EXCEEDED') || s.includes('MET') || s === 'SUCCESS' || s === 'GREEN' || s === 'GOOD') {
    return 'ACHIEVED';
  }
  if (s.includes('AVERAGE')) {
    return 'NEEDS ATTENTION';
  }
  if (s.includes('ATTENTION') || s.includes('WARN') || s.includes('RISK') || s.includes('BEHIND') || s === 'YELLOW') {
    return 'NEEDS ATTENTION';
  }
  if (s.includes('CRITICAL') || s.includes('BELOW') || s.includes('FAIL') || s.includes('ERROR') || s === 'RED') {
    return 'CRITICAL';
  }
  if (s.includes('ON TRACK') || s === 'OK' || s === 'NORMAL') {
    return 'ON TRACK';
  }

  // Safety net derivation using actual performance percentage
  const perfVal = typeof performance === 'number' ? performance : parseFloat(String(performance || ''));
  if (performance !== undefined && !isNaN(perfVal)) {
    if (perfVal >= 100) return 'ACHIEVED';
    if (perfVal >= 85) return 'ON TRACK';
    if (perfVal >= 60) return 'NEEDS ATTENTION';
    return 'CRITICAL';
  }

  return 'ON TRACK';
};

/**
 * Gets semantic badge information for rendering in the report.
 */
const getSemanticBadgeInfo = (status: string, performance?: number | string) => {
  const norm = normalizeStatus(status, performance);
  switch (norm) {
    case 'ACHIEVED':
      return {
        normalized: 'ACHIEVED' as const,
        badgeText: 'Achieved',
        bgColor: [209, 250, 229] as [number, number, number], // emerald-100
        textColor: [6, 95, 70] as [number, number, number], // emerald-800
      };
    case 'NEEDS ATTENTION':
      return {
        normalized: 'NEEDS ATTENTION' as const,
        badgeText: String(status || '').toUpperCase().includes('RISK') ? 'At Risk' : 'Needs Attention',
        bgColor: [254, 243, 199] as [number, number, number], // amber-100
        textColor: [146, 64, 14] as [number, number, number], // amber-800
      };
    case 'CRITICAL':
      return {
        normalized: 'CRITICAL' as const,
        badgeText: 'Critical',
        bgColor: [254, 226, 226] as [number, number, number], // rose-100
        textColor: [153, 27, 27] as [number, number, number], // rose-800
      };
    default:
      return {
        normalized: 'ON TRACK' as const,
        badgeText: 'On Track',
        bgColor: [219, 234, 254] as [number, number, number], // blue-100
        textColor: [30, 58, 138] as [number, number, number], // blue-800
      };
  }
};

export interface KPIAnalysisExportParams {
  kpis: KPIMetric[];
  wakalaStats: {
    total: number;
    active: number;
    inactive: number;
    activePercent: string;
    inactivePercent: string;
  } | null;
  regionalData: any[];
  districtData: any[];
  selectedRegion: string | null;
  progressMetrics: any;
  activeMonth: string;
  selectedMetric: string;
}

export function exportKPIAnalysisToPDF({
  kpis,
  wakalaStats,
  regionalData,
  districtData,
  selectedRegion,
  progressMetrics,
  activeMonth,
  selectedMetric,
}: KPIAnalysisExportParams) {
  const doc = new jsPDF('p', 'mm', 'a4');
  let pageNum = 1;
  const margin = 15;
  const pageHeight = 297;
  const pageWidth = 210;
  const contentWidth = pageWidth - 2 * margin; // 180mm

  // Standard Header and Footer drawing helper
  const drawHeaderAndFooter = (docInstance: jsPDF, pNum: number) => {
    // Draw Top Accent Bar
    docInstance.setFillColor(0, 65, 167); // Brand Primary Blue
    docInstance.rect(0, 0, pageWidth, 5, 'F');

    // Draw Footer
    docInstance.setFont('helvetica', 'normal');
    docInstance.setFontSize(8);
    docInstance.setTextColor(148, 163, 184); // slate-400
    docInstance.text(`CONFIDENTIAL - ${getCompanyName().toUpperCase()} INTERNAL ANALYSIS REPORT - ${activeMonth.toUpperCase()}`, margin, pageHeight - 10);
    docInstance.text(`Page ${pNum}`, pageWidth - margin - 12, pageHeight - 10);
  };

  // Initial page setup
  drawHeaderAndFooter(doc, pageNum);

  let currentY = 18;

  // Company Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0, 65, 167); // Brand Primary Blue
  doc.text(getCompanyName().toUpperCase(), margin, currentY);

  // Subtitle
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`${getCompanyName().toUpperCase()} INTERNAL ANALYSIS REPORT - ${activeMonth.toUpperCase()}`, margin, currentY);

  // Metadata Block
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // slate-500
  const rightAlignX = pageWidth - margin;
  const dateStr = `Exported: ${formatDateTime(new Date())}`;
  doc.text(dateStr, rightAlignX - 62, 18);
  doc.text(`Active Month: ${activeMonth}`, rightAlignX - 44, 23);
  doc.text('Notice: Proprietary Thresholds (Company Rule)', rightAlignX - 68, 28);

  // Separator Line
  currentY += 6;
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(margin, currentY, pageWidth - margin, currentY);

  // --- TELECOM-REPORTED KPIs ---
  currentY += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 65, 167);
  doc.text('TELECOM-REPORTED KEY PERFORMANCE INDICATORS (FOR REFERENCE)', margin, currentY);
  currentY += 5;

  const cardWidth = 41; // 4 cards in a row
  const cardHeight = 22;
  const cardGap = 5;
  const startX = margin;

  const telecomKPIs = kpis.map((kpi) => {
    const isMonetary = isMonetaryKPI(kpi.name);
    return {
      name: kpi.name,
      achieved: formatFullNumber(kpi.achievedVal ?? kpi.achieved, isMonetary),
      target: formatFullNumber(kpi.targetVal ?? kpi.target, isMonetary),
      performance: kpi.performance,
      status: normalizeStatus(kpi.status, kpi.performance),
    };
  });

  telecomKPIs.forEach((card, idx) => {
    const cardX = startX + idx * (cardWidth + cardGap);
    const cardY = currentY;

    // Draw box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    // Accent left stripe
    const badge = getSemanticBadgeInfo(card.status, card.performance);
    doc.setFillColor(badge.bgColor[0], badge.bgColor[1], badge.bgColor[2]);
    doc.rect(cardX, cardY, 1.5, cardHeight, 'F');

    // Title text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139); // slate-500
    
    let displayName = card.name.toUpperCase();
    if (displayName.length > 20) {
      displayName = displayName.substring(0, 18) + '...';
    }
    doc.text(displayName, cardX + 3.5, cardY + 4.5);

    // Achieved/Value text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(String(card.achieved), cardX + 3.5, cardY + 11.5);

    // Target and Performance %
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Target: ${card.target}`, cardX + 3.5, cardY + 16.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`${card.performance}%`, cardX + cardWidth - 3.5, cardY + 16.5, { align: 'right' });

    // Progress bar
    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(cardX + 3.5, cardY + 18.5, cardWidth - 7, 1.0, 0.4, 0.4, 'F');
    const filledWidth = (cardWidth - 7) * (Math.min(100, card.performance) / 100);
    if (filledWidth > 0) {
      doc.setFillColor(badge.textColor[0], badge.textColor[1], badge.textColor[2]);
      doc.roundedRect(cardX + 3.5, cardY + 18.5, filledWidth, 1.0, 0.4, 0.4, 'F');
    }
  });

  currentY += cardHeight + 8;

  // --- INTERNAL ACTIVITY RULE ---
  if (wakalaStats) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 65, 167);
    doc.text(`${getCompanyName().toUpperCase()} INTERNAL ACTIVITY RULE (PROPRIETARY ANALYSIS)`, margin, currentY);
    currentY += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const activityRules = getActivityRules();
    doc.text(
      `Active: min ${activityRules.threshold} CI+CO transactions. Served: TZS ${activityRules.amountThreshold.toLocaleString()} volume (Active wakala), or ${activityRules.servedTxnThreshold} transactions / TZS ${activityRules.amountThreshold.toLocaleString()} volume (Inactive wakala).`,
      margin,
      currentY
    );
    currentY += 4;

    // Draw a cohesive callout block for internal activity stats
    const calloutWidth = contentWidth;
    const calloutHeight = 16;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, calloutWidth, calloutHeight, 2, 2, 'FD');

    // Left accent bar
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(margin, currentY, 2, calloutHeight, 'F');

    // 3 blocks of information: Total Wakalas, Active Wakalas, Inactive Wakalas
    const colW = calloutWidth / 3;
    
    // Block 1: Total
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL WAKALAS SERVICED', margin + 6, currentY + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(formatFullNumber(wakalaStats.total), margin + 6, currentY + 11);

    // Block 2: Active
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('ACTIVE WAKALAS (MEETS THRESHOLD)', margin + colW + 6, currentY + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(`${formatFullNumber(wakalaStats.active)} (${wakalaStats.activePercent}%)`, margin + colW + 6, currentY + 11);

    // Block 3: Inactive
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('INACTIVE WAKALAS (UNDER THRESHOLD)', margin + colW * 2 + 6, currentY + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(225, 29, 72); // rose-600
    doc.text(`${formatFullNumber(wakalaStats.inactive)} (${wakalaStats.inactivePercent}%)`, margin + colW * 2 + 6, currentY + 11);

    currentY += calloutHeight + 8;
  }

  // --- PROGRESS TOWARD TARGET WEEKLY TRACKER ---
  if (progressMetrics) {
    if (currentY + 45 > pageHeight - 20) {
      doc.addPage();
      pageNum++;
      drawHeaderAndFooter(doc, pageNum);
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 65, 167);
    doc.text(`WEEKLY PROGRESS: ${selectedMetric.toUpperCase()}`, margin, currentY);
    currentY += 5;

    // Draw box for weekly metrics overview
    const boxHeight = 16;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2, 2, 'FD');

    // Columns: Target, Latest Achieved, Progress, Trajectory
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('MONTHLY TARGET', margin + 6, currentY + 5);
    doc.text('LATEST WEEKLY ACHIEVED', margin + 46, currentY + 5);
    doc.text('PROGRESS %', margin + 96, currentY + 5);
    doc.text('TRAJECTORY STATUS', margin + 136, currentY + 5);

    const isMonetary = isMonetaryKPI(selectedMetric);
    const targetFormatted = formatFullNumber(progressMetrics.monthlyTargetVal, isMonetary);
    const achievedFormatted = formatFullNumber(progressMetrics.latestWeeklyAchievedVal, isMonetary);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(targetFormatted, margin + 6, currentY + 11);
    doc.text(achievedFormatted, margin + 46, currentY + 11);
    doc.text(`${progressMetrics.progressPercent}%`, margin + 96, currentY + 11);

    // Trajectory Status Badge
    const trajText = String(progressMetrics.trajectoryStatus || 'N/A');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    if (trajText.includes('AHEAD')) doc.setTextColor(16, 185, 129); // emerald
    else if (trajText.includes('BEHIND')) doc.setTextColor(225, 29, 72); // rose
    else doc.setTextColor(0, 65, 167); // blue
    doc.text(trajText, margin + 136, currentY + 11);

    currentY += boxHeight + 4;

    // Week-over-week trends list
    if (progressMetrics.weeklyPoints && progressMetrics.weeklyPoints.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('Weekly Checkpoint History:', margin, currentY + 4);
      currentY += 6;

      const pWidth = contentWidth / progressMetrics.weeklyPoints.length;
      progressMetrics.weeklyPoints.forEach((pt: any, ptIdx: number) => {
        const ptX = margin + ptIdx * pWidth;
        
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(241, 245, 249);
        doc.roundedRect(ptX + 1, currentY, pWidth - 2, 12, 1, 1, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text(pt.reportingWeek, ptX + 3, currentY + 4.5);

        const ptAchievedFormatted = formatFullNumber(pt.achievedVal, isMonetary);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text(ptAchievedFormatted, ptX + 3, currentY + 9.5);
      });
      currentY += 16;
    } else {
      currentY += 4;
    }
  }

  // --- REGIONAL PERFORMANCE TABLE ---
  if (currentY + 25 > pageHeight - 20) {
    doc.addPage();
    pageNum++;
    drawHeaderAndFooter(doc, pageNum);
    currentY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 65, 167);
  doc.text('REGIONAL PERFORMANCE OVERVIEW', margin, currentY);
  currentY += 5;

  const tableHeaderHeight = 7;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(margin, currentY, contentWidth, tableHeaderHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);

  const regColOffsets = [0, 20, 36, 50, 64, 88, 106, 124, 142, 162]; // total width = 180mm
  doc.text('REGION', margin + regColOffsets[0] + 1, currentY + 4.8);
  doc.text('WAKALAS', margin + regColOffsets[1] + 1, currentY + 4.8);
  doc.text('ACTIVE %', margin + regColOffsets[2] + 1, currentY + 4.8);
  doc.text('SERVED %', margin + regColOffsets[3] + 1, currentY + 4.8);
  doc.text('SERVICING', margin + regColOffsets[4] + 1, currentY + 4.8);
  doc.text('PRODUCT %', margin + regColOffsets[5] + 1, currentY + 4.8);
  doc.text('CASH IN', margin + regColOffsets[6] + 1, currentY + 4.8);
  doc.text('CASH OUT', margin + regColOffsets[7] + 1, currentY + 4.8);
  doc.text('NET FLOW', margin + regColOffsets[8] + 1, currentY + 4.8);
  doc.text('BEHAVIOR', margin + regColOffsets[9] + 1, currentY + 4.8);

  currentY += tableHeaderHeight;

  regionalData.forEach((reg, idx) => {
    const rowHeight = 8;
    if (currentY + rowHeight > pageHeight - 20) {
      doc.addPage();
      pageNum++;
      drawHeaderAndFooter(doc, pageNum);
      currentY = 18;

      // Repeat Table Header
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, currentY, contentWidth, tableHeaderHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text('REGION', margin + regColOffsets[0] + 1, currentY + 4.8);
      doc.text('WAKALAS', margin + regColOffsets[1] + 1, currentY + 4.8);
      doc.text('ACTIVE %', margin + regColOffsets[2] + 1, currentY + 4.8);
      doc.text('SERVED %', margin + regColOffsets[3] + 1, currentY + 4.8);
      doc.text('SERVICING', margin + regColOffsets[4] + 1, currentY + 4.8);
      doc.text('PRODUCT %', margin + regColOffsets[5] + 1, currentY + 4.8);
      doc.text('CASH IN', margin + regColOffsets[6] + 1, currentY + 4.8);
      doc.text('CASH OUT', margin + regColOffsets[7] + 1, currentY + 4.8);
      doc.text('NET FLOW', margin + regColOffsets[8] + 1, currentY + 4.8);
      doc.text('BEHAVIOR', margin + regColOffsets[9] + 1, currentY + 4.8);
      currentY += tableHeaderHeight;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text(reg.region, margin + regColOffsets[0] + 1, currentY + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(51, 65, 85);
    doc.text(formatFullNumber(reg.totalWakalas), margin + regColOffsets[1] + 1, currentY + 5.2);
    doc.text(`${reg.activePercent.toFixed(1)}%`, margin + regColOffsets[2] + 1, currentY + 5.2);
    doc.text(`${reg.servedPercent.toFixed(1)}%`, margin + regColOffsets[3] + 1, currentY + 5.2);
    doc.text(formatFullNumber(reg.totalServicingValue, true), margin + regColOffsets[4] + 1, currentY + 5.2);
    doc.text(`${reg.productSellerPercent.toFixed(1)}%`, margin + regColOffsets[5] + 1, currentY + 5.2);
    doc.text(formatFullNumber(reg.totalCI, true), margin + regColOffsets[6] + 1, currentY + 5.2);
    doc.text(formatFullNumber(reg.totalCO, true), margin + regColOffsets[7] + 1, currentY + 5.2);
    
    // Net Flow
    if (reg.netFlow >= 0) doc.setTextColor(16, 185, 129);
    else doc.setTextColor(225, 29, 72);
    doc.setFont('helvetica', 'bold');
    doc.text(formatFullNumber(reg.netFlow, true), margin + regColOffsets[8] + 1, currentY + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(reg.behavior, margin + regColOffsets[9] + 1, currentY + 5.2);

    currentY += rowHeight;
  });
  currentY += 6;

  // --- DISTRICTS DRILL-DOWN SUMMARY ---
  const districtsToDraw = selectedRegion 
    ? districtData.filter(d => d.region === selectedRegion)
    : districtData;

  if (districtsToDraw.length > 0) {
    if (currentY + 25 > pageHeight - 20) {
      doc.addPage();
      pageNum++;
      drawHeaderAndFooter(doc, pageNum);
      currentY = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 65, 167);
    const titleRegionText = selectedRegion ? `SITES DRILL-DOWN: ${selectedRegion.toUpperCase()} DISTRICTS` : 'SITES DRILL-DOWN: DISTRICT LEVEL DETAILS';
    doc.text(titleRegionText, margin, currentY);
    currentY += 5;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, currentY, contentWidth, tableHeaderHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const distColOffsets = [0, 30, 48, 66, 98, 122, 140, 158]; // layout
    doc.text(selectedRegion ? 'DISTRICT' : 'DISTRICT (REGION)', margin + distColOffsets[0] + 2, currentY + 4.8);
    doc.text('WAKALAS', margin + distColOffsets[1] + 2, currentY + 4.8);
    doc.text('ACTIVE %', margin + distColOffsets[2] + 2, currentY + 4.8);
    doc.text('SERVICING VALUE', margin + distColOffsets[3] + 2, currentY + 4.8);
    doc.text('PRODUCT %', margin + distColOffsets[4] + 2, currentY + 4.8);
    doc.text('NET FLOW', margin + distColOffsets[5] + 2, currentY + 4.8);
    doc.text('CI:CO', margin + distColOffsets[6] + 2, currentY + 4.8);
    doc.text('BEHAVIOR', margin + distColOffsets[7] + 2, currentY + 4.8);

    currentY += tableHeaderHeight;

    const sortedDistricts = [...districtsToDraw].sort((a, b) => (b.totalServicingValue || 0) - (a.totalServicingValue || 0));
    const rowsToDraw = selectedRegion ? sortedDistricts : sortedDistricts.slice(0, 15);

    rowsToDraw.forEach((dist, idx) => {
      const rowHeight = 8;
      if (currentY + rowHeight > pageHeight - 20) {
        doc.addPage();
        pageNum++;
        drawHeaderAndFooter(doc, pageNum);
        currentY = 18;

        // Repeat Table Header
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, currentY, contentWidth, tableHeaderHeight, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(selectedRegion ? 'DISTRICT' : 'DISTRICT (REGION)', margin + distColOffsets[0] + 2, currentY + 4.8);
        doc.text('WAKALAS', margin + distColOffsets[1] + 2, currentY + 4.8);
        doc.text('ACTIVE %', margin + distColOffsets[2] + 2, currentY + 4.8);
        doc.text('SERVICING VALUE', margin + distColOffsets[3] + 2, currentY + 4.8);
        doc.text('PRODUCT %', margin + distColOffsets[4] + 2, currentY + 4.8);
        doc.text('NET FLOW', margin + distColOffsets[5] + 2, currentY + 4.8);
        doc.text('CI:CO', margin + distColOffsets[6] + 2, currentY + 4.8);
        doc.text('BEHAVIOR', margin + distColOffsets[7] + 2, currentY + 4.8);
        currentY += tableHeaderHeight;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      const labelText = selectedRegion ? dist.district : `${dist.district} (${dist.region})`;
      const truncatedLabel = labelText.length > 22 ? labelText.substring(0, 20) + '..' : labelText;
      doc.text(truncatedLabel, margin + distColOffsets[0] + 2, currentY + 5.2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text(formatFullNumber(dist.totalWakalas), margin + distColOffsets[1] + 2, currentY + 5.2);
      doc.text(`${dist.activePercent.toFixed(1)}%`, margin + distColOffsets[2] + 2, currentY + 5.2);
      doc.text(formatFullNumber(dist.totalServicingValue, true), margin + distColOffsets[3] + 2, currentY + 5.2);
      doc.text(`${dist.productSellerPercent.toFixed(1)}%`, margin + distColOffsets[4] + 2, currentY + 5.2);
      
      // Net Flow
      if (dist.netFlow >= 0) doc.setTextColor(16, 185, 129);
      else doc.setTextColor(225, 29, 72);
      doc.setFont('helvetica', 'bold');
      doc.text(formatFullNumber(dist.netFlow, true), margin + distColOffsets[5] + 2, currentY + 5.2);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(dist.cicoRatio.toFixed(2), margin + distColOffsets[6] + 2, currentY + 5.2);
      doc.text(dist.behavior, margin + distColOffsets[7] + 2, currentY + 5.2);

      currentY += rowHeight;
    });

    if (!selectedRegion && districtsToDraw.length > 15) {
      currentY += 4;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`* Showing top 15 of ${districtsToDraw.length} districts/sites. Select a single region in the dashboard to export its full district set.`, margin, currentY);
    }
  }

  // Save the generated document
  const companySlug = getCompanyName().replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${companySlug}_KPI_Detailed_Analysis_${activeMonth.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
