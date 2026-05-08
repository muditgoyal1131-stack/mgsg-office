import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

export const extractReceipt = async (req: Request, res: Response) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    // Dynamically import tesseract.js
    const Tesseract = await import('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(file.path, 'eng', {
      logger: () => {},
    } as any);

    // Clean up temp file
    fs.unlink(file.path, () => {});

    // Parse extracted text for common receipt patterns
    const result = parseReceiptText(text);
    res.json({ rawText: text, ...result });
  } catch (err: any) {
    // Clean up on error
    if (file?.path) fs.unlink(file.path, () => {});
    console.error('OCR error:', err);
    res.status(500).json({ message: 'OCR processing failed', error: err.message });
  }
};

function parseReceiptText(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // --- Amount detection ---
  // Look for patterns like ₹1,234.56 or Rs. 500 or Total: 1500 or TOTAL 250.00
  const amountPatterns = [
    /(?:total|amount|grand total|net amount|payable|paid|rs\.?|₹)\s*:?\s*([\d,]+\.?\d*)/i,
    /₹\s*([\d,]+\.?\d*)/,
    /rs\.?\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.\d{2})\s*(?:inr|rs|₹)?/i,
  ];

  let amount = '';
  for (const pattern of amountPatterns) {
    const m = text.match(pattern);
    if (m) {
      amount = m[1].replace(/,/g, '');
      // Validate reasonable amount (between 1 and 10 million)
      const num = parseFloat(amount);
      if (num > 0 && num < 10000000) break;
      amount = '';
    }
  }

  // --- Date detection ---
  // Common formats: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, YYYY-MM-DD
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]+(\d{2,4})/i,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  ];

  let date = '';
  for (const pattern of datePatterns) {
    const m = text.match(pattern);
    if (m) {
      try {
        // Try to build a valid date
        const raw = m[0];
        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
          date = parsed.toISOString().slice(0, 10);
          break;
        }
        // Manual parse for DD/MM/YYYY
        if (raw.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)) {
          const parts = raw.split(/[\/\-]/);
          let day = parseInt(parts[0]);
          let month = parseInt(parts[1]);
          let year = parseInt(parts[2]);
          if (year < 100) year += 2000;
          if (day > 12 && month <= 12) {
            // DD/MM/YYYY
            const d = new Date(year, month - 1, day);
            if (!isNaN(d.getTime())) { date = d.toISOString().slice(0, 10); break; }
          }
        }
      } catch {}
    }
  }

  // If no date found, use today
  if (!date) date = new Date().toISOString().slice(0, 10);

  // --- Description / Merchant detection ---
  // First non-empty line that looks like a merchant name
  const skipWords = /^\s*(tax|gst|invoice|receipt|bill|gstin|cin|phone|tel|email|www|address|date|time|order|serial|thank|total|sub|net|amount|rs|₹|\d)/i;
  let description = '';
  for (const line of lines.slice(0, 8)) {
    if (line.length >= 3 && line.length <= 60 && !skipWords.test(line) && !/^\d+$/.test(line)) {
      description = line;
      break;
    }
  }

  // --- Category guess ---
  const lower = text.toLowerCase();
  let category = '';
  if (/fuel|petrol|diesel|pump|hp|iocl|bpcl/.test(lower)) category = 'TRAVEL';
  else if (/hotel|lodge|stay|accommodation|inn|resort/.test(lower)) category = 'ACCOMMODATION';
  else if (/restaurant|food|cafe|meal|dinner|lunch|breakfast|swiggy|zomato/.test(lower)) category = 'FOOD';
  else if (/uber|ola|taxi|cab|auto|train|flight|bus|toll/.test(lower)) category = 'TRAVEL';
  else if (/stationery|office|paper|pen|printer/.test(lower)) category = 'OFFICE';

  return { amount, date, description, category };
}
