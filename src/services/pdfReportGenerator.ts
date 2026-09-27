import { jsPDF } from 'jspdf';
import { AuctionRoomState, Team } from '../types';
import { PLAYERS_BY_ID } from '../data/players';
import { formatPrice } from '../utils/format';
import { buildBestXIDraft, generateTeamAnalysis } from './bestXIEngine';

export function generateAuctionPDFReport(roomState: AuctionRoomState): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPageBreak(requiredHeight: number) {
    if (y + requiredHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawPageHeader();
    }
  }

  function drawPageHeader() {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('IPL CRICKET AUCTION — OFFICIAL FINAL REPORT', margin, 10);
    doc.text(`Room: ${roomState.id}`, pageWidth - margin - 30, 10);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, 12, pageWidth - margin, 12);
    y = Math.max(y, 16);
  }

  // ----------------------------------------------------------------------------
  // 1. COVER / HEADER
  // ----------------------------------------------------------------------------
  // Header Banner Background
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, y, contentWidth, 42, 'F');

  doc.setFontSize(9);
  doc.setTextColor(245, 158, 11); // amber-500
  doc.setFont('helvetica', 'bold');
  doc.text('OFFICIAL AUCTION RECORD & ANALYTICAL DOSSIER', margin + 6, y + 8);

  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('IPL CRICKET AUCTION', margin + 6, y + 17);

  doc.setFontSize(12);
  doc.setTextColor(226, 232, 240);
  doc.text(roomState.name.toUpperCase(), margin + 6, y + 24);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  const dateStr = new Date(roomState.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  doc.text(`Room ID: ${roomState.id}   |   Date: ${dateStr}   |   Status: COMPLETED (LOCKED)`, margin + 6, y + 33);
  doc.text(`Auctioneer: ${roomState.auctioneerName}   |   Total Sequence Events: ${roomState.eventSequenceNumber}`, margin + 6, y + 38);

  y += 48;

  // ----------------------------------------------------------------------------
  // 2. AUCTION SUMMARY METRICS
  // ----------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. AUCTION GLOBAL SUMMARY', margin, y);
  y += 5;

  const teamList = Object.values(roomState.teams);
  const totalSpent = teamList.reduce((sum, t) => sum + (t.startingPurse - t.remainingPurse), 0);
  const totalRemaining = teamList.reduce((sum, t) => sum + t.remainingPurse, 0);
  const totalSold = Object.keys(roomState.soldPlayers || {}).length;
  const totalUnsold = (roomState.unsoldPlayerIds || []).length;
  const totalOverseas = teamList.reduce((sum, t) => sum + t.overseasCount, 0);

  // Summary Grid Cards
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 32, 2, 2, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);

  const colWidth = contentWidth / 4;
  const row1Y = y + 7;
  const row2Y = y + 21;

  // Row 1
  doc.text('TOTAL FRANCHISES', margin + 4, row1Y);
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${teamList.length}`, margin + 4, row1Y + 5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('PLAYERS SOLD', margin + colWidth + 4, row1Y);
  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text(`${totalSold}`, margin + colWidth + 4, row1Y + 5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('PLAYERS UNSOLD', margin + colWidth * 2 + 4, row1Y);
  doc.setFontSize(12);
  doc.setTextColor(239, 68, 68); // red-500
  doc.text(`${totalUnsold}`, margin + colWidth * 2 + 4, row1Y + 5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('OVERSEAS PLAYERS', margin + colWidth * 3 + 4, row1Y);
  doc.setFontSize(12);
  doc.setTextColor(59, 130, 246); // blue-500
  doc.text(`${totalOverseas}`, margin + colWidth * 3 + 4, row1Y + 5);

  // Row 2
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('TOTAL MONEY SPENT', margin + 4, row2Y);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${formatPrice(totalSpent)}`, margin + 4, row2Y + 5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('REMAINING PURSE POOL', margin + colWidth + 4, row2Y);
  doc.setFontSize(11);
  doc.setTextColor(16, 185, 129);
  doc.text(`${formatPrice(totalRemaining)}`, margin + colWidth + 4, row2Y + 5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('STARTING PURSE/TEAM', margin + colWidth * 2 + 4, row2Y);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${formatPrice(roomState.settings.startingPurse)}`, margin + colWidth * 2 + 4, row2Y + 5);

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('CONNECTED BIDDERS', margin + colWidth * 3 + 4, row2Y);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${Object.keys(roomState.participants).length}`, margin + colWidth * 3 + 4, row2Y + 5);

  y += 40;

  // ----------------------------------------------------------------------------
  // 3. TEAM COMPARISON TABLE
  // ----------------------------------------------------------------------------
  checkPageBreak(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. FRANCHISE COMPARATIVE INDEX & SPENDING EFFICIENCY', margin, y);
  y += 5;

  // Table Header
  doc.setFillColor(30, 41, 59);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('FRANCHISE', margin + 3, y + 5);
  doc.text('SQUAD', margin + 48, y + 5);
  doc.text('O/S', margin + 64, y + 5);
  doc.text('SPENT', margin + 78, y + 5);
  doc.text('PURSE LEFT', margin + 104, y + 5);
  doc.text('OVERALL', margin + 130, y + 5);
  doc.text('BAT', margin + 146, y + 5);
  doc.text('BOWL', margin + 158, y + 5);
  doc.text('DEPTH', margin + 170, y + 5);
  y += 7;

  teamList.forEach((team, index) => {
    checkPageBreak(8);
    const analysis = generateTeamAnalysis(team);
    const spent = team.startingPurse - team.remainingPurse;

    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${team.shortName} - ${team.name.substring(0, 18)}`, margin + 3, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.text(`${team.squadSize}`, margin + 50, y + 4.5);
    doc.text(`${team.overseasCount}/4`, margin + 64, y + 4.5);
    doc.text(formatPrice(spent), margin + 78, y + 4.5);
    doc.text(formatPrice(team.remainingPurse), margin + 104, y + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text(`${analysis.overallScore}`, margin + 132, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(`${analysis.battingScore.score}`, margin + 146, y + 4.5);
    doc.text(`${analysis.bowlingScore.score}`, margin + 158, y + 4.5);
    doc.text(`${analysis.benchStrengthScore.score}`, margin + 170, y + 4.5);

    y += 6.5;
  });

  y += 8;

  // ----------------------------------------------------------------------------
  // 4. TEAM-BY-TEAM DOSSIER (SQUAD, BEST XI & EXPLANATION)
  // ----------------------------------------------------------------------------
  teamList.forEach((team) => {
    checkPageBreak(80);
    const analysis = generateTeamAnalysis(team);
    const spent = team.startingPurse - team.remainingPurse;

    // Team Header Box
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(245, 158, 11);
    doc.text(`[${team.shortName}] ${team.name.toUpperCase()}`, margin + 5, y + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(226, 232, 240);
    doc.text(
      `Spent: ${formatPrice(spent)}   |   Purse: ${formatPrice(team.remainingPurse)}   |   Squad: ${team.squadSize}   |   Overseas: ${team.overseasCount}/4   |   Overall Rating: ${analysis.overallScore}/100`,
      margin + 5,
      y + 11
    );

    y += 18;

    // Squad Roster Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Purchased Squad Members:', margin, y);
    y += 4;

    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text('PLAYER', margin + 3, y + 4.2);
    doc.text('ROLE', margin + 55, y + 4.2);
    doc.text('NATIONALITY', margin + 85, y + 4.2);
    doc.text('BASE PRICE', margin + 120, y + 4.2);
    doc.text('PURCHASE PRICE', margin + 150, y + 4.2);
    y += 6;

    if (team.playersBought.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('No players purchased during this auction.', margin + 3, y + 4.5);
      y += 7;
    } else {
      team.playersBought.forEach((item, pIndex) => {
        checkPageBreak(7);
        const player = PLAYERS_BY_ID[item.playerId];
        if (!player) return;

        if (pIndex % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentWidth, 5.5, 'F');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text(`${player.name} ${player.isOverseas ? '(OS)' : ''}`, margin + 3, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.text(player.role.replace('_', ' '), margin + 55, y + 4);
        doc.text(player.nationality, margin + 85, y + 4);
        doc.text(formatPrice(item.basePrice), margin + 120, y + 4);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text(formatPrice(item.soldPrice), margin + 150, y + 4);

        y += 5.5;
      });
    }

    y += 5;

    // Best Playing XI Selection
    checkPageBreak(35);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    // Use the team's submitted Playing XI; fall back to the engine's suggestion.
    const submitted = roomState.playingXIs?.[team.id];
    const sheet = submitted ?? buildBestXIDraft(team);
    doc.text(
      submitted
        ? `Playing XI (submitted ${new Date(submitted.submittedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}):`
        : 'Suggested Playing XI (not submitted by the team):',
      margin,
      y,
    );
    y += 4;

    const order = (sheet.battingOrder.length === sheet.playerIds.length ? sheet.battingOrder : sheet.playerIds)
      .map(id => PLAYERS_BY_ID[id])
      .filter(Boolean);

    if (order.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Insufficient squad members to formulate a legal 11-man lineup.', margin + 3, y + 4);
      y += 8;
    } else {
      // Two columns of batting order: 1-6 left, 7-11 right.
      const rows = Math.ceil(order.length / 2);
      const boxHeight = rows * 4.6 + 5;
      checkPageBreak(boxHeight + 14);
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');
      doc.setFontSize(7.5);
      order.forEach((p, idx) => {
        const col = idx < rows ? 0 : 1;
        const row = col === 0 ? idx : idx - rows;
        const marks = [
          p.id === sheet.captainId ? 'C' : '',
          p.id === sheet.viceCaptainId ? 'VC' : '',
          p.id === sheet.wicketKeeperId ? 'WK' : '',
          p.isOverseas ? 'OS' : '',
        ].filter(Boolean);
        const x = margin + 4 + col * (contentWidth / 2);
        const rowY = y + 5 + row * 4.6;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`${idx + 1}. ${p.name}`, x, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        const meta = [p.role.replace('_', ' ').toLowerCase(), ...marks].join('  ·  ');
        doc.text(meta, x + 52, rowY);
      });
      y += boxHeight + 3;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      const subs = sheet.impactSubIds.map(id => PLAYERS_BY_ID[id]).filter(Boolean);
      doc.text(`Impact substitutes: ${subs.length ? subs.map(p => p.shortName + (p.isOverseas ? ' (OS)' : '')).join(', ') : 'none named'}`, margin + 3, y + 2);
      y += 7;
    }

    // Algorithmic Ratings Breakdown
    checkPageBreak(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Team ratings (40-99), overall ${analysis.overallScore}:`, margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);

    const units = [
      ['Batting', analysis.battingScore.score],
      ['Top order', analysis.topOrderScore.score],
      ['Hitting', analysis.finishingScore.score],
      ['Bowling', analysis.bowlingScore.score],
      ['Run control', analysis.economyScore.score],
      ['Wicket-taking', analysis.wicketTakingScore.score],
      ['All-rounders', analysis.allRoundersScore.score],
      ['Keeping', analysis.wicketkeepingScore.score],
      ['Experience', analysis.experienceScore.score],
      ['Bench', analysis.benchStrengthScore.score],
    ] as const;
    const line = (xs: readonly (readonly [string, number])[]) => xs.map(([k, v]) => `${k}: ${v}`).join('   |   ');
    doc.text(line(units.slice(0, 5)), margin + 3, y + 3);
    doc.text(line(units.slice(5)), margin + 3, y + 7.5);
    y += 11;

    if (analysis.strengths.length || analysis.weaknesses.length) {
      doc.setFontSize(7);
      if (analysis.strengths.length) {
        doc.setTextColor(16, 124, 84);
        doc.text(`Strengths: ${analysis.strengths.join('; ')}`, margin + 3, y + 2, { maxWidth: contentWidth - 6 });
        y += 5;
      }
      if (analysis.weaknesses.length) {
        doc.setTextColor(180, 83, 9);
        doc.text(`Watch-outs: ${analysis.weaknesses.join('; ')}`, margin + 3, y + 2, { maxWidth: contentWidth - 6 });
        y += 5;
      }
    }

    // Written Justification & Notes
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Explanation: ${analysis.dataSourceNotes}`, margin + 3, y + 2, {
      maxWidth: contentWidth - 6,
    });

    y += 14;
  });

  // ----------------------------------------------------------------------------
  // 5. FOOTER ON ALL PAGES
  // ----------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Generated by IPL Live Auction Arena · Server Authoritative Verification · Page ${i} of ${totalPages}`,
      margin,
      pageHeight - 8
    );
  }

  return doc;
}
