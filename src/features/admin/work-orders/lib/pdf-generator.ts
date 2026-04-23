import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

interface WorkOrderPdfInput {
  workOrderNumber: string;
  detailUrl: string;
  frameSku: string;
  frameShape: string | null;
  frameColor: string | null;
  frameSize: string | null;
  lensType: string;
  lensMaterial: string;
  tint: string | null;
  monocularPdOd: number | null;
  monocularPdOs: number | null;
  rx: {
    od: { sphere: string | null; cylinder: string | null; axis: string | null };
    os: { sphere: string | null; cylinder: string | null; axis: string | null };
  };
  specialInstructions?: string | null;
  orderNumber: string;
  customerName: string;
}

export async function generateWorkOrderPdf(input: WorkOrderPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const { width } = page.getSize();

  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const margin = 40;
  let y = 752;

  page.drawText('GLASSYVISION', { x: margin, y, size: 12, font: helvBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  page.drawText('WORK ORDER', { x: margin, y, size: 24, font: helvBold });
  page.drawText(input.workOrderNumber, { x: margin, y: y - 28, size: 18, font: mono });

  const qrDataUrl = await QRCode.toDataURL(input.detailUrl, { margin: 0, width: 96 });
  const qrBytes = Uint8Array.from(atob(qrDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: width - margin - 96, y: y - 60, width: 96, height: 96 });

  y -= 90;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

  y -= 24;
  page.drawText('ORDER', { x: margin, y, size: 9, font: helvBold });
  page.drawText(`${input.orderNumber} · ${input.customerName}`, { x: margin + 60, y, size: 10, font: helv });

  y -= 20;
  page.drawText('FRAME', { x: margin, y, size: 9, font: helvBold });
  page.drawText(input.frameSku, { x: margin + 60, y, size: 10, font: mono });
  y -= 14;
  const frameMeta = [input.frameShape, input.frameColor, input.frameSize].filter(Boolean).join(' · ');
  if (frameMeta) {
    page.drawText(frameMeta, { x: margin + 60, y, size: 10, font: helv });
    y -= 14;
  }

  y -= 10;
  page.drawText('LENS', { x: margin, y, size: 9, font: helvBold });
  page.drawText(`${input.lensType} · ${input.lensMaterial} · tint: ${input.tint ?? 'none'}`, { x: margin + 60, y, size: 10, font: helv });

  y -= 20;
  page.drawText('PD', { x: margin, y, size: 9, font: helvBold });
  page.drawText(`OD ${input.monocularPdOd ?? '—'}  /  OS ${input.monocularPdOs ?? '—'}`, { x: margin + 60, y, size: 10, font: mono });

  y -= 28;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

  y -= 24;
  page.drawText('PRESCRIPTION', { x: margin, y, size: 10, font: helvBold });

  y -= 20;
  const col1 = margin;
  const col2 = margin + 80;
  const col3 = margin + 160;
  const col4 = margin + 240;

  page.drawText('', { x: col1, y, size: 8, font: helvBold });
  page.drawText('SPH', { x: col2, y, size: 8, font: helvBold });
  page.drawText('CYL', { x: col3, y, size: 8, font: helvBold });
  page.drawText('AXIS', { x: col4, y, size: 8, font: helvBold });

  y -= 14;
  page.drawText('OD', { x: col1, y, size: 11, font: helvBold });
  page.drawText(input.rx.od.sphere ?? '—', { x: col2, y, size: 11, font: mono });
  page.drawText(input.rx.od.cylinder ?? '—', { x: col3, y, size: 11, font: mono });
  page.drawText(input.rx.od.axis ?? '—', { x: col4, y, size: 11, font: mono });

  y -= 16;
  page.drawText('OS', { x: col1, y, size: 11, font: helvBold });
  page.drawText(input.rx.os.sphere ?? '—', { x: col2, y, size: 11, font: mono });
  page.drawText(input.rx.os.cylinder ?? '—', { x: col3, y, size: 11, font: mono });
  page.drawText(input.rx.os.axis ?? '—', { x: col4, y, size: 11, font: mono });

  if (input.specialInstructions) {
    y -= 30;
    page.drawText('SPECIAL INSTRUCTIONS', { x: margin, y, size: 9, font: helvBold });
    y -= 14;
    const lines = input.specialInstructions.match(/.{1,80}/g) ?? [];
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size: 10, font: helv });
      y -= 12;
    }
  }

  page.drawText('Printed from glassyvision.com', { x: margin, y: 30, size: 8, font: helv, color: rgb(0.5, 0.5, 0.5) });

  return doc.save();
}
