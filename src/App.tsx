/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  FileText,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  UploadCloud,
  FileDown,
  X,
  Scissors,
  Layers,
  Send,
  Copy,
  Check,
  ArrowDown10,
  ArrowUp10,
  Hash
} from 'lucide-react';

enum AppMode {
  NUM_TO_VCF = 'NUM_TO_VCF',
  TXT_TO_VCF = 'TXT_TO_VCF',
  VCF_TO_TXT = 'VCF_TO_TXT',
  SPLIT_VCF = 'SPLIT_VCF',
  SPLIT_TXT = 'SPLIT_TXT'
}

function TelegramIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  );
}

interface ResultFileItem {
  name: string;
  count: number;
  type: 'kontak' | 'nomor';
  content: string;
  blob: Blob;
  fileObj: File;
}

// 1. Natural Sort for File Names (Ascending 1 -> 2 -> 3 -> 10)
const naturalSortAscending = (items: ResultFileItem[]): ResultFileItem[] => {
  return [...items].sort((a, b) => {
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
};

// 2. Numerical / Phone Number Ascending Sort Algorithm
const sortNumbersAscending = (nums: string[]): string[] => {
  return [...nums].sort((a, b) => {
    const cleanA = a.replace(/\D/g, '');
    const cleanB = b.replace(/\D/g, '');
    if (cleanA && cleanB && cleanA !== cleanB) {
      if (cleanA.length !== cleanB.length) {
        return cleanA.length - cleanB.length;
      }
      return cleanA.localeCompare(cleanB);
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
};

// 3. Natural vCard Contacts Ascending Sort Algorithm
const sortVcfCardsAscending = (cards: string[]): string[] => {
  return [...cards].sort((cardA, cardB) => {
    const fnMatchA = cardA.match(/\nFN.*?:([^\r\n]+)/i) || cardA.match(/^FN.*?:([^\r\n]+)/i);
    const fnMatchB = cardB.match(/\nFN.*?:([^\r\n]+)/i) || cardB.match(/^FN.*?:([^\r\n]+)/i);
    const fnA = fnMatchA ? fnMatchA[1].trim() : '';
    const fnB = fnMatchB ? fnMatchB[1].trim() : '';

    if (fnA && fnB) {
      return fnA.localeCompare(fnB, undefined, { numeric: true, sensitivity: 'base' });
    }

    const nMatchA = cardA.match(/\nN.*?:([^\r\n]+)/i) || cardA.match(/^N.*?:([^\r\n]+)/i);
    const nMatchB = cardB.match(/\nN.*?:([^\r\n]+)/i) || cardB.match(/^N.*?:([^\r\n]+)/i);
    const nA = nMatchA ? nMatchA[1].trim() : '';
    const nB = nMatchB ? nMatchB[1].trim() : '';

    if (nA && nB) {
      return nA.localeCompare(nB, undefined, { numeric: true, sensitivity: 'base' });
    }

    const telMatchA = cardA.match(/TEL.*?:([^\r\n]+)/i);
    const telMatchB = cardB.match(/TEL.*?:([^\r\n]+)/i);
    const telA = telMatchA ? telMatchA[1].replace(/\D/g, '') : '';
    const telB = telMatchB ? telMatchB[1].replace(/\D/g, '') : '';

    return telA.localeCompare(telB, undefined, { numeric: true });
  });
};

// Helper to format file number with zero-padding (e.g. 01, 02... 10)
const formatFileIndex = (index: number, maxIndex: number, enablePadding: boolean): string => {
  if (!enablePadding) return String(index);
  const padLength = Math.max(2, String(maxIndex).length);
  return String(index).padStart(padLength, '0');
};

// Helper to format contact name number starting with 3 digits (001, 002, 003...)
const formatContactIndex = (index: number, minDigits: number = 3): string => {
  return String(index).padStart(minDigits, '0');
};

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.NUM_TO_VCF);

  // Sorting and Naming Global Controls
  const [sortAscending, setSortAscending] = useState(true);
  const [useZeroPadding, setUseZeroPadding] = useState(true);
  const [downloadOrder, setDownloadOrder] = useState<'asc' | 'desc'>('asc');
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);

  // Mode 1: NUM_TO_VCF & Mode 2: TXT_TO_VCF State
  const [phoneNumbers, setPhoneNumbers] = useState('');
  const [contactPrefix, setContactPrefix] = useState('Customer');
  const [startContactIndex, setStartContactIndex] = useState(1); // 1 produces 001, 002... (0 produces 000, 001...)
  const [fileName, setFileName] = useState('lead_database');

  // Splitting Features for NUM_TO_VCF & TXT_TO_VCF
  const [isSplit, setIsSplit] = useState(false);
  const [splitSize, setSplitSize] = useState(500);
  const [startFileNumber, setStartFileNumber] = useState(1);

  // Special Group Contacts (Admin, Navy, etc)
  const [specialGroups, setSpecialGroups] = useState<{ id: string; label: string; numbers: string; active: boolean }[]>([
    { id: crypto.randomUUID(), label: 'Admin', numbers: '', active: false },
    { id: crypto.randomUUID(), label: 'Navy', numbers: '', active: false }
  ]);

  // Mode 2: TXT to VCF State
  const [txtFile, setTxtFile] = useState<File | null>(null);

  // Mode 3: VCF to TXT State
  const [vcfFile, setVcfFile] = useState<File | null>(null);
  const [extractedNumbers, setExtractedNumbers] = useState('');
  const [txtOutputName, setTxtOutputName] = useState('extracted_numbers');
  const [isTxtSplit, setIsTxtSplit] = useState(false);
  const [txtSplitSize, setTxtSplitSize] = useState(500);
  const [txtStartFileNumber, setTxtStartFileNumber] = useState(1);

  // Mode 4: Split VCF Dedicated State
  const [splitVcfFile, setSplitVcfFile] = useState<File | null>(null);
  const [splitCards, setSplitCards] = useState<string[]>([]);
  const [splitFileName, setSplitFileName] = useState('kontak_split');
  const [splitContactsPerFile, setSplitContactsPerFile] = useState<number>(500);
  const [splitStartNumber, setSplitStartNumber] = useState<number>(1);
  const [renameVcfContacts, setRenameVcfContacts] = useState(false);

  // Mode 5: Split TXT Dedicated State
  const [splitTxtFile, setSplitTxtFile] = useState<File | null>(null);
  const [splitTxtContent, setSplitTxtContent] = useState('');
  const [splitTxtNumbers, setSplitTxtNumbers] = useState<string[]>([]);
  const [splitTxtFileName, setSplitTxtFileName] = useState('nomor_split');
  const [splitTxtSize, setSplitTxtSize] = useState<number>(500);
  const [splitTxtStartNumber, setSplitTxtStartNumber] = useState<number>(1);

  // Unified Result & Telegram Share Modal
  const [resultFiles, setResultFiles] = useState<ResultFileItem[] | null>(null);
  const [resultModalTitle, setResultModalTitle] = useState('Berhasil!');
  const [resultModalSubtitle, setResultModalSubtitle] = useState('');
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [sharingStatus, setSharingStatus] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSpecialGroup = () => {
    setSpecialGroups([...specialGroups, { id: crypto.randomUUID(), label: '', numbers: '', active: true }]);
  };

  const removeSpecialGroup = (id: string) => {
    setSpecialGroups(specialGroups.filter(g => g.id !== id));
  };

  const updateSpecialGroup = (id: string, field: string, value: any) => {
    setSpecialGroups(specialGroups.map(g => g.id === id ? { ...g, [field]: value } : g));
  };

  const parseNumbers = (input: string) => {
    return input
      .split(/[\n,;]+/)
      .map(num => num.trim())
      .filter(num => num.length > 0);
  };

  const parseVcfCards = (vcfText: string): string[] => {
    const normalized = vcfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const cardRegex = /BEGIN:VCARD[\s\S]*?END:VCARD/gi;
    const matches = normalized.match(cardRegex);
    if (!matches || matches.length === 0) {
      return [];
    }
    return matches.map(c => c.trim()).filter(c => c.length > 0);
  };

  // Convert numbers to VCF (for NUM_TO_VCF & TXT_TO_VCF) with 001, 002, 003 contact naming & Ascending Sorting
  const handleConvert = useCallback(() => {
    let numbers = parseNumbers(phoneNumbers);
    const activeSpecialNumbers = specialGroups
      .filter(g => g.active && g.numbers)
      .map(g => parseNumbers(g.numbers))
      .flat();

    if (numbers.length === 0 && activeSpecialNumbers.length === 0) {
      setError('Silakan masukkan nomor telepon atau aktifkan setidaknya satu grup kontak.');
      return;
    }

    if (sortAscending) {
      numbers = sortNumbersAscending(numbers);
    }

    try {
      const formatNum = (n: string) => {
        let cleaned = n.trim().replace(/\s+/g, '');
        if (cleaned.startsWith('+')) return cleaned;
        if (cleaned.startsWith('0')) return '+62' + cleaned.substring(1);
        if (cleaned.startsWith('62')) return '+' + cleaned;
        return '+' + cleaned;
      };

      const generateVcfContent = (numList: string[], startIdx: number, includeSpecial: boolean) => {
        let content = '';

        if (includeSpecial) {
          specialGroups.forEach(group => {
            if (group.active && group.label && group.numbers) {
              const gNumbers = sortAscending ? sortNumbersAscending(parseNumbers(group.numbers)) : parseNumbers(group.numbers);
              gNumbers.forEach((num, gIdx) => {
                const formattedIdx = formatContactIndex(startContactIndex + gIdx);
                const displayName = `${group.label} ${formattedIdx}`.trim();
                content += `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;TYPE=CELL:${formatNum(num)}\nEND:VCARD\n`;
              });
            }
          });
        }

        numList.forEach((num, index) => {
          const formattedIdx = formatContactIndex(startContactIndex + startIdx + index);
          const displayName = `${contactPrefix} ${formattedIdx}`.trim();
          content += `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;TYPE=CELL:${formatNum(num)}\nEND:VCARD\n`;
        });
        return content;
      };

      const results: ResultFileItem[] = [];
      const baseName = fileName.trim() || 'contacts';

      if (isSplit && numbers.length > 0) {
        const startNum = Math.max(0, startFileNumber || 1);
        const chunkSize = Math.max(1, splitSize || 1);
        const totalFiles = Math.ceil(numbers.length / chunkSize);
        const maxIndex = startNum + totalFiles - 1;

        let currentFileIdx = startNum;

        for (let i = 0; i < numbers.length; i += chunkSize) {
          const chunk = numbers.slice(i, i + chunkSize);
          const content = generateVcfContent(chunk, i, i === 0);
          const formattedIdx = formatFileIndex(currentFileIdx, maxIndex, useZeroPadding);
          const chunkName = `${baseName} ${formattedIdx}.vcf`;
          const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });
          const fileObj = new File([blob], chunkName, { type: 'text/vcard' });

          results.push({
            name: chunkName,
            count: chunk.length + (i === 0 ? activeSpecialNumbers.length : 0),
            type: 'kontak',
            content,
            blob,
            fileObj
          });
          currentFileIdx++;
        }
      } else {
        const content = generateVcfContent(numbers, 0, true);
        const singleName = `${baseName}.vcf`;
        const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });
        const fileObj = new File([blob], singleName, { type: 'text/vcard' });

        results.push({
          name: singleName,
          count: numbers.length + activeSpecialNumbers.length,
          type: 'kontak',
          content,
          blob,
          fileObj
        });
      }

      const sortedResults = naturalSortAscending(results);

      setResultFiles(sortedResults);
      setResultModalTitle(
        mode === AppMode.TXT_TO_VCF
          ? 'File VCF Berhasil Dibuat dari TXT!'
          : 'File VCF Berhasil Dibuat!'
      );
      setResultModalSubtitle(
        `Total ${numbers.length + activeSpecialNumbers.length} kontak berhasil dibuat dengan penamaan 001, 002... (${results.length} file).`
      );
      setIsResultModalOpen(true);
      setIsSuccess(true);
      setError(null);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      setError('Terjadi kesalahan saat membuat file. Silakan coba lagi.');
      console.error(err);
    }
  }, [phoneNumbers, contactPrefix, startContactIndex, fileName, isSplit, splitSize, startFileNumber, specialGroups, mode, sortAscending, useZeroPadding]);

  // Mode 3: Extract VCF to TXT handler with Ascending Sorting
  const handleExtractTxt = () => {
    let numbers = parseNumbers(extractedNumbers);
    if (numbers.length === 0) {
      setError('Tidak ada nomor telepon yang dapat diekstrak.');
      return;
    }

    if (sortAscending) {
      numbers = sortNumbersAscending(numbers);
    }

    try {
      const results: ResultFileItem[] = [];
      const baseName = (txtOutputName || vcfFile?.name.replace(/\.vcf$/i, '') || 'extracted_numbers').trim();

      if (isTxtSplit && numbers.length > 0) {
        const startNum = Math.max(0, txtStartFileNumber || 1);
        const chunkSize = Math.max(1, txtSplitSize || 1);
        const totalFiles = Math.ceil(numbers.length / chunkSize);
        const maxIndex = startNum + totalFiles - 1;

        let currentFileIdx = startNum;

        for (let i = 0; i < numbers.length; i += chunkSize) {
          const chunk = numbers.slice(i, i + chunkSize);
          const formattedIdx = formatFileIndex(currentFileIdx, maxIndex, useZeroPadding);
          const chunkName = `${baseName} ${formattedIdx}.txt`;
          const content = chunk.join('\n');
          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
          const fileObj = new File([blob], chunkName, { type: 'text/plain' });

          results.push({
            name: chunkName,
            count: chunk.length,
            type: 'nomor',
            content,
            blob,
            fileObj
          });
          currentFileIdx++;
        }
      } else {
        const content = numbers.join('\n');
        const singleName = `${baseName}.txt`;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const fileObj = new File([blob], singleName, { type: 'text/plain' });

        results.push({
          name: singleName,
          count: numbers.length,
          type: 'nomor',
          content,
          blob,
          fileObj
        });
      }

      const sortedResults = naturalSortAscending(results);

      setResultFiles(sortedResults);
      setResultModalTitle('Nomor Telepon Berhasil Diekstrak!');
      setResultModalSubtitle(
        `Total ${numbers.length} nomor berhasil diekstrak ke dalam ${results.length} file TXT (Urutan Ascending).`
      );
      setIsResultModalOpen(true);
      setIsSuccess(true);
      setError(null);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Terjadi kesalahan saat mengekstrak nomor.');
    }
  };

  // Mode 4: Split VCF File Handler with Ascending Sorting & Optional Renaming
  const handleSplitVcf = () => {
    if (!splitVcfFile || splitCards.length === 0) {
      setError('Silakan pilih file .vcf yang memiliki kontak terlebih dahulu.');
      return;
    }

    let cardsToSplit = splitCards;
    if (sortAscending) {
      cardsToSplit = sortVcfCardsAscending(splitCards);
    }

    // Optional: Rename contacts with 001, 002, 003... if enabled
    if (renameVcfContacts) {
      cardsToSplit = cardsToSplit.map((card, idx) => {
        const formattedNum = formatContactIndex(startContactIndex + idx);
        const newFn = `${splitFileName.trim() || 'Kontak'} ${formattedNum}`;
        let updated = card;
        if (/FN:/i.test(updated)) {
          updated = updated.replace(/FN:([^\r\n]+)/i, `FN:${newFn}`);
        } else {
          updated = updated.replace(/BEGIN:VCARD/i, `BEGIN:VCARD\nFN:${newFn}`);
        }
        return updated;
      });
    }

    const perFile = Math.max(1, splitContactsPerFile || 1);
    const startNum = Math.max(0, splitStartNumber || 1);
    const totalCards = cardsToSplit.length;
    const totalFiles = Math.ceil(totalCards / perFile);
    const maxIndex = startNum + totalFiles - 1;

    try {
      const results: ResultFileItem[] = [];
      let fileIdx = startNum;

      for (let i = 0; i < totalCards; i += perFile) {
        const chunk = cardsToSplit.slice(i, i + perFile);
        const formattedIdx = formatFileIndex(fileIdx, maxIndex, useZeroPadding);
        const chunkName = `${splitFileName.trim() || 'kontak'} ${formattedIdx}.vcf`;
        const content = chunk.join('\n') + '\n';
        const blob = new Blob([content], { type: 'text/vcard;charset=utf-8' });
        const fileObj = new File([blob], chunkName, { type: 'text/vcard' });

        results.push({
          name: chunkName,
          count: chunk.length,
          type: 'kontak',
          content,
          blob,
          fileObj
        });
        fileIdx++;
      }

      const sortedResults = naturalSortAscending(results);

      setResultFiles(sortedResults);
      setResultModalTitle('File VCF Berhasil Dipecah!');
      setResultModalSubtitle(
        `Total ${totalCards} kontak dibagi menjadi ${results.length} file VCF secara urut (Ascending 1 ke ${results.length}).`
      );
      setIsResultModalOpen(true);
      setIsSuccess(true);
      setError(null);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Terjadi kesalahan saat membagi file VCF.');
    }
  };

  // Mode 5: Split TXT Dedicated Handler
  const handleSplitTxt = () => {
    let numbers = splitTxtNumbers;
    if (numbers.length === 0) {
      numbers = parseNumbers(splitTxtContent);
    }
    if (numbers.length === 0) {
      setError('Silakan pilih file .txt atau masukkan nomor telepon terlebih dahulu.');
      return;
    }

    if (sortAscending) {
      numbers = sortNumbersAscending(numbers);
    }

    const perFile = Math.max(1, splitTxtSize || 1);
    const startNum = Math.max(0, splitTxtStartNumber || 1);
    const totalNums = numbers.length;
    const totalFiles = Math.ceil(totalNums / perFile);
    const maxIndex = startNum + totalFiles - 1;

    try {
      const results: ResultFileItem[] = [];
      let fileIdx = startNum;

      for (let i = 0; i < totalNums; i += perFile) {
        const chunk = numbers.slice(i, i + perFile);
        const formattedIdx = formatFileIndex(fileIdx, maxIndex, useZeroPadding);
        const chunkName = `${splitTxtFileName.trim() || 'nomor'} ${formattedIdx}.txt`;
        const content = chunk.join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const fileObj = new File([blob], chunkName, { type: 'text/plain' });

        results.push({
          name: chunkName,
          count: chunk.length,
          type: 'nomor',
          content,
          blob,
          fileObj
        });
        fileIdx++;
      }

      const sortedResults = naturalSortAscending(results);

      setResultFiles(sortedResults);
      setResultModalTitle('File TXT Berhasil Dipecah!');
      setResultModalSubtitle(
        `Total ${totalNums} nomor dibagi menjadi ${results.length} file TXT (Urutan Ascending 1 ke ${results.length}).`
      );
      setIsResultModalOpen(true);
      setIsSuccess(true);
      setError(null);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('Terjadi kesalahan saat membagi file TXT.');
    }
  };

  // File Upload Handlers
  const handleVcfUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.vcf')) {
      setError('Hanya file .vcf yang didukung.');
      return;
    }

    setVcfFile(file);
    const base = file.name.replace(/\.vcf$/i, '').trim();
    if (base) setTxtOutputName(`${base}_numbers`);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lines = content.split('\n');
      const numbers: string[] = [];

      lines.forEach(line => {
        if (line.toUpperCase().startsWith('TEL')) {
          const parts = line.split(':');
          if (parts.length > 1) {
            const numPart = parts[parts.length - 1].trim();
            if (numPart) numbers.push(numPart);
          }
        }
      });

      if (numbers.length === 0) {
        setError('Tidak ada nomor telepon yang ditemukan dalam file ini.');
        setExtractedNumbers('');
      } else {
        const sorted = sortAscending ? sortNumbersAscending(numbers) : numbers;
        setExtractedNumbers(sorted.join('\n'));
      }
    };
    reader.readAsText(file);
  };

  const handleTxtUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Hanya file .txt yang didukung.');
      return;
    }

    setTxtFile(file);
    const base = file.name.replace(/\.txt$/i, '').trim();
    if (base) setFileName(base);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const numbers = content.match(/[+]?\d{5,15}/g);
      if (!numbers || numbers.length === 0) {
        setError('Tidak ada nomor telepon yang ditemukan dalam file .txt ini.');
        setPhoneNumbers('');
      } else {
        const sorted = sortAscending ? sortNumbersAscending(numbers) : numbers;
        setPhoneNumbers(sorted.join('\n'));
      }
    };
    reader.readAsText(file);
  };

  const handleSplitVcfUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.vcf')) {
      setError('Hanya file berformat .vcf yang didukung.');
      return;
    }

    setSplitVcfFile(file);
    const baseName = file.name.replace(/\.vcf$/i, '').trim();
    if (baseName) {
      setSplitFileName(baseName);
    }
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const cards = parseVcfCards(content);
      if (cards.length === 0) {
        setError('Tidak ada kontak vCard valid (BEGIN:VCARD ... END:VCARD) yang ditemukan dalam file ini.');
        setSplitCards([]);
      } else {
        setSplitCards(cards);
        setError(null);
      }
    };
    reader.onerror = () => {
      setError('Gagal membaca file VCF. Pastikan file tidak rusak.');
    };
    reader.readAsText(file);
  };

  const handleSplitTxtUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Hanya file berformat .txt yang didukung.');
      return;
    }

    setSplitTxtFile(file);
    const baseName = file.name.replace(/\.txt$/i, '').trim();
    if (baseName) {
      setSplitTxtFileName(baseName);
    }
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const numbers = content.match(/[+]?\d{5,15}/g) || parseNumbers(content);
      if (!numbers || numbers.length === 0) {
        setError('Tidak ada nomor telepon yang ditemukan dalam file .txt ini.');
        setSplitTxtNumbers([]);
        setSplitTxtContent('');
      } else {
        const sorted = sortAscending ? sortNumbersAscending(numbers) : numbers;
        setSplitTxtNumbers(sorted);
        setSplitTxtContent(sorted.join('\n'));
        setError(null);
      }
    };
    reader.onerror = () => {
      setError('Gagal membaca file .txt.');
    };
    reader.readAsText(file);
  };

  // Download a single file
  const downloadSingleFile = (item: { blob: Blob; name: string }) => {
    const url = window.URL.createObjectURL(item.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 1000);
  };

  // Download all files in STRICT ASCENDING ORDER (1 -> 2 -> 3 -> 4) with real-time progress
  const downloadAllFiles = async (files: ResultFileItem[]) => {
    if (!files || files.length === 0 || isDownloadingBatch) return;

    let queue = naturalSortAscending(files);

    if (downloadOrder === 'desc') {
      queue = [...queue].reverse();
    }

    setIsDownloadingBatch(true);

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setDownloadProgress({
        current: i + 1,
        total: queue.length,
        name: item.name
      });

      downloadSingleFile(item);

      if (i < queue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    setTimeout(() => {
      setIsDownloadingBatch(false);
      setDownloadProgress(null);
    }, 1500);
  };

  // Universal Share to Telegram with iOS and modern browser Web Share API support
  const shareFilesToTelegram = async (filesToShare: ResultFileItem[]) => {
    setIsSharing(true);
    setSharingStatus(null);

    const sortedToShare = naturalSortAscending(filesToShare);
    const fileObjs = sortedToShare.map(f => f.fileObj);

    // 1. Try iOS / Android native Web Share API with files
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: fileObjs })) {
      try {
        await navigator.share({
          files: fileObjs,
          title: `File (${fileObjs.length} Berkas - Urutan 1 s/d ${fileObjs.length})`,
          text: `Berikut adalah berkas kontak/nomor (${fileObjs.length} file - Urutan Ascending). Silakan pilih Telegram.`
        });
        setIsSharing(false);
        setSharingStatus('Menu share terbuka! Silakan pilih Telegram untuk mengirim.');
        setTimeout(() => setSharingStatus(null), 4000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setIsSharing(false);
          return;
        }
        console.warn('Multi-file share failed, trying single file fallback:', err);
      }
    }

    // 2. Single file share fallback
    if (sortedToShare.length === 1 && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [fileObjs[0]] })) {
      try {
        await navigator.share({
          files: [fileObjs[0]],
          title: fileObjs[0].name,
          text: `Berkas: ${fileObjs[0].name}`
        });
        setIsSharing(false);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setIsSharing(false);
          return;
        }
      }
    }

    // 3. Fallback for Desktop: Download file & open Telegram
    await downloadAllFiles(sortedToShare);

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = 'tg://msg';
    } else {
      window.open('https://web.telegram.org', '_blank');
    }

    setIsSharing(false);
    setSharingStatus('File telah diunduh berurutan! Silakan lampirkan file ke ruang obrolan Telegram.');
    setTimeout(() => setSharingStatus(null), 6000);
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    });
  };

  const handleClear = () => {
    if (mode === AppMode.NUM_TO_VCF) {
      setPhoneNumbers('');
    } else if (mode === AppMode.VCF_TO_TXT) {
      setVcfFile(null);
      setExtractedNumbers('');
    } else if (mode === AppMode.TXT_TO_VCF) {
      setTxtFile(null);
      setPhoneNumbers('');
    } else if (mode === AppMode.SPLIT_VCF) {
      setSplitVcfFile(null);
      setSplitCards([]);
    } else if (mode === AppMode.SPLIT_TXT) {
      setSplitTxtFile(null);
      setSplitTxtNumbers([]);
      setSplitTxtContent('');
    }
    setError(null);
  };

  const specialNumbersCount = (mode === AppMode.NUM_TO_VCF || mode === AppMode.TXT_TO_VCF)
    ? specialGroups
      .filter(g => g.active && g.numbers)
      .reduce((sum, g) => sum + parseNumbers(g.numbers).length, 0)
    : 0;

  const count = mode === AppMode.VCF_TO_TXT
    ? parseNumbers(extractedNumbers).length
    : mode === AppMode.SPLIT_VCF
      ? splitCards.length
      : mode === AppMode.SPLIT_TXT
        ? (splitTxtNumbers.length || parseNumbers(splitTxtContent).length)
        : (parseNumbers(phoneNumbers).length + specialNumbersCount);

  return (
    <div className="h-screen w-full bg-zinc-950 text-zinc-100 font-sans flex flex-col overflow-hidden">
      {/* Header Navigation */}
      <nav className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md shrink-0 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Smartphone className="w-5 h-5 text-zinc-950" />
          </div>
          <span className="text-xl font-bold tracking-tight uppercase">KZ ADITT CV</span>
        </div>

        {/* Mode Switcher Tabs with Horizontal Scroll for iOS & Mobile */}
        <div className="flex overflow-x-auto max-w-full bg-zinc-900 p-1 rounded-xl border border-zinc-800 no-scrollbar shrink-0 gap-0.5">
          <button
            onClick={() => { setMode(AppMode.NUM_TO_VCF); setError(null); handleClear(); }}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${mode === AppMode.NUM_TO_VCF ? 'bg-emerald-500 text-zinc-950 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Numbers to VCF
          </button>
          <button
            onClick={() => { setMode(AppMode.TXT_TO_VCF); setError(null); handleClear(); }}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${mode === AppMode.TXT_TO_VCF ? 'bg-emerald-500 text-zinc-950 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            TXT to VCF
          </button>
          <button
            onClick={() => { setMode(AppMode.VCF_TO_TXT); setError(null); handleClear(); }}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${mode === AppMode.VCF_TO_TXT ? 'bg-emerald-500 text-zinc-950 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            VCF to TXT
          </button>
          <button
            onClick={() => { setMode(AppMode.SPLIT_VCF); setError(null); handleClear(); }}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${mode === AppMode.SPLIT_VCF ? 'bg-emerald-500 text-zinc-950 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Split VCF</span>
          </button>
          <button
            onClick={() => { setMode(AppMode.SPLIT_TXT); setError(null); handleClear(); }}
            className={`px-3 md:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${mode === AppMode.SPLIT_TXT ? 'bg-emerald-500 text-zinc-950 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Scissors className="w-3.5 h-3.5 text-sky-400" />
            <span>Split TXT</span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-500 shrink-0">
          <button className="px-4 py-1.5 rounded-full bg-zinc-900 text-zinc-400 hover:bg-zinc-800 transition-colors">v3.5.0</button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950">
        <motion.div
          key={mode}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-6xl my-auto"
        >
          {/* Header Title & Subtitle */}
          <div className="mb-6 text-center">
            <h1 className="text-3xl md:text-5xl font-black text-white mb-2 tracking-tight">
              {mode === AppMode.NUM_TO_VCF && 'Numbers to VCF'}
              {mode === AppMode.TXT_TO_VCF && 'TXT to VCF'}
              {mode === AppMode.VCF_TO_TXT && 'VCF to TXT'}
              {mode === AppMode.SPLIT_VCF && 'Split VCF File'}
              {mode === AppMode.SPLIT_TXT && 'Split TXT File'}
            </h1>
            <p className="text-zinc-500 max-w-xl mx-auto italic text-xs md:text-sm">
              {mode === AppMode.NUM_TO_VCF && 'Konversi nomor ke vCard .vcf dengan nama kontak 001, 002, 003... dan sorting ascending otomatis.'}
              {mode === AppMode.TXT_TO_VCF && 'Impor file .txt dan simpan kontak .vcf dengan nama 001, 002, 003... (Support Pisah File & Telegram iOS).'}
              {mode === AppMode.VCF_TO_TXT && 'Ekstrak nomor telepon dari file vCard (.vcf) ke berkas teks rapi berurutan mulai dari angka terkecil.'}
              {mode === AppMode.SPLIT_VCF && 'Pecah file kontak .vcf besar menjadi beberapa berkas kecil terurut rapi mulai dari 1 - 2 - 3 - 4.'}
              {mode === AppMode.SPLIT_TXT && 'Pecah file .txt besar menjadi beberapa berkas .txt lebih kecil terurut rapi (1 → 2 → 3 → 4).'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left Column (Input Source) */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">
                  {mode === AppMode.NUM_TO_VCF && '01. Input Phone Numbers'}
                  {mode === AppMode.TXT_TO_VCF && '01. Upload TXT File'}
                  {mode === AppMode.VCF_TO_TXT && '01. Upload VCF File'}
                  {mode === AppMode.SPLIT_VCF && '01. Masukkan File VCF'}
                  {mode === AppMode.SPLIT_TXT && '01. Masukkan File / Teks TXT'}
                </label>
                {count > 0 && (
                  <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {count} {mode === AppMode.SPLIT_VCF ? 'CONTACTS DETECTED' : 'NUMBERS DETECTED'}
                  </span>
                )}
              </div>

              <div className="relative group flex-1 min-h-[300px]">
                {mode === AppMode.NUM_TO_VCF ? (
                  <textarea
                    id="numbers"
                    value={phoneNumbers}
                    onChange={(e) => {
                      const filtered = e.target.value.replace(/[^0-9\n\r,;+]/g, '');
                      setPhoneNumbers(filtered);
                      if (error) setError(null);
                    }}
                    placeholder="Masukkan nomor (satu per baris)...&#10;+62812345678&#10;+62819876543"
                    className="w-full h-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-zinc-300 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 resize-none font-mono text-sm leading-relaxed transition-all placeholder:text-zinc-700"
                  />
                ) : mode === AppMode.TXT_TO_VCF ? (
                  <div className="w-full h-full flex flex-col gap-4">
                    <label className={`w-full aspect-[16/6] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${txtFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
                      <input type="file" accept=".txt" onChange={handleTxtUpload} className="hidden" />
                      <UploadCloud className={`w-10 h-10 ${txtFile ? 'text-emerald-500' : 'text-zinc-700'}`} />
                      <div className="text-center px-4">
                        <span className="block text-sm font-bold text-zinc-300 truncate max-w-[260px]">{txtFile ? txtFile.name : 'Pilih file .txt'}</span>
                        <span className="text-[10px] text-zinc-500">Nomor akan dideteksi secara otomatis</span>
                      </div>
                    </label>
                    <textarea
                      readOnly
                      value={phoneNumbers}
                      placeholder="Nomor yang terdeteksi akan muncul di sini..."
                      className="flex-1 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 text-zinc-500 font-mono text-xs focus:outline-none resize-none"
                    />
                  </div>
                ) : mode === AppMode.VCF_TO_TXT ? (
                  <div className="w-full h-full flex flex-col gap-4">
                    <label className={`w-full aspect-[16/6] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${vcfFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
                      <input type="file" accept=".vcf" onChange={handleVcfUpload} className="hidden" />
                      <UploadCloud className={`w-10 h-10 ${vcfFile ? 'text-emerald-500' : 'text-zinc-700'}`} />
                      <div className="text-center px-4">
                        <span className="block text-sm font-bold text-zinc-300 truncate max-w-[260px]">{vcfFile ? vcfFile.name : 'Pilih file .vcf'}</span>
                        <span className="text-[10px] text-zinc-500">Klik atau seret file ke sini</span>
                      </div>
                    </label>
                    <textarea
                      readOnly
                      value={extractedNumbers}
                      placeholder="Hasil nomor yang diekstrak akan muncul di sini..."
                      className="flex-1 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 text-zinc-500 font-mono text-xs focus:outline-none resize-none"
                    />
                  </div>
                ) : mode === AppMode.SPLIT_VCF ? (
                  <div className="w-full h-full flex flex-col gap-4">
                    <label className={`w-full aspect-[16/6] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${splitVcfFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
                      <input type="file" accept=".vcf" onChange={handleSplitVcfUpload} className="hidden" />
                      <UploadCloud className={`w-10 h-10 ${splitVcfFile ? 'text-emerald-500' : 'text-zinc-700'}`} />
                      <div className="text-center px-4">
                        <span className="block text-sm font-bold text-zinc-300 truncate max-w-[260px]">
                          {splitVcfFile ? splitVcfFile.name : 'Pilih atau Masukkan file .vcf'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {splitVcfFile ? `${(splitVcfFile.size / 1024).toFixed(1)} KB - Klik untuk ganti` : 'Klik atau seret file VCF ke sini'}
                        </span>
                      </div>
                    </label>

                    <div className="flex-1 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
                      {splitCards.length > 0 ? (
                        <div className="space-y-2 overflow-y-auto max-h-[190px] pr-1">
                          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span>Pratinjau Kontak</span>
                            <span className="text-emerald-400 font-mono">{splitCards.length} Kontak Terdeteksi</span>
                          </div>
                          {(sortAscending ? sortVcfCardsAscending(splitCards) : splitCards).slice(0, 4).map((card, idx) => {
                            const fnMatch = card.match(/FN:(.+)/i);
                            const telMatch = card.match(/TEL.*:(.+)/i);
                            const name = fnMatch ? fnMatch[1].trim() : `Kontak #${idx + 1}`;
                            const tel = telMatch ? telMatch[1].trim() : '-';
                            return (
                              <div key={idx} className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                                <span className="font-semibold text-zinc-200 truncate max-w-[140px]">{name}</span>
                                <span className="font-mono text-zinc-500 text-[11px]">{tel}</span>
                              </div>
                            );
                          })}
                          {splitCards.length > 4 && (
                            <p className="text-[10px] text-zinc-600 text-center italic pt-1">
                              + {splitCards.length - 4} kontak lainnya siap dipecah (Urut Ascending)
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-600">
                          <Scissors className="w-8 h-8 mb-2 opacity-40 text-emerald-500" />
                          <p className="text-xs font-medium text-zinc-400">Pilih file .vcf untuk membagi kontak menjadi beberapa berkas kecil.</p>
                          <p className="text-[10px] text-zinc-600 mt-1">Mendukung format vCard 2.1, 3.0, dan 4.0.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* SPLIT TXT Mode: Left Column */
                  <div className="w-full h-full flex flex-col gap-4">
                    <label className={`w-full aspect-[16/6] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer ${splitTxtFile ? 'border-sky-500/50 bg-sky-500/5' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'}`}>
                      <input type="file" accept=".txt" onChange={handleSplitTxtUpload} className="hidden" />
                      <UploadCloud className={`w-10 h-10 ${splitTxtFile ? 'text-sky-400' : 'text-zinc-700'}`} />
                      <div className="text-center px-4">
                        <span className="block text-sm font-bold text-zinc-300 truncate max-w-[260px]">
                          {splitTxtFile ? splitTxtFile.name : 'Pilih atau Masukkan file .txt'}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {splitTxtFile ? `${(splitTxtFile.size / 1024).toFixed(1)} KB - Klik untuk ganti` : 'Klik atau seret file TXT ke sini'}
                        </span>
                      </div>
                    </label>

                    <textarea
                      value={splitTxtContent}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSplitTxtContent(val);
                        const nums = val.match(/[+]?\d{5,15}/g) || parseNumbers(val);
                        setSplitTxtNumbers(nums);
                        if (error) setError(null);
                      }}
                      placeholder="Atau tempel/ketik daftar nomor di sini (satu per baris)...&#10;+62812345678&#10;+62819876543"
                      className="flex-1 bg-zinc-950 border border-zinc-900 rounded-2xl p-4 text-zinc-300 font-mono text-xs focus:outline-none focus:border-sky-500/50 resize-none"
                    />
                  </div>
                )}

                {(phoneNumbers || vcfFile || txtFile || splitVcfFile || splitTxtContent || splitTxtFile) && (
                  <button
                    onClick={handleClear}
                    className="absolute top-4 right-4 p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                    title="Clear All"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Column (Controls & Settings) */}
            <div className="lg:col-span-7 flex flex-col gap-5">

              {/* MODE 1 & 2: NUM_TO_VCF & TXT_TO_VCF */}
              {(mode === AppMode.NUM_TO_VCF || mode === AppMode.TXT_TO_VCF) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Name Prefix with 3-digit zero-padding control */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      02. Name Prefix & Format 000
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                          <input
                            type="text"
                            value={contactPrefix}
                            onChange={(e) => setContactPrefix(e.target.value)}
                            placeholder="Prefix nama..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-3 py-2.5 text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 text-sm font-medium"
                          />
                        </div>
                        <div className="w-24 shrink-0" title="Mulai Angka Kontak (0 = 000, 1 = 001)">
                          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2.5">
                            <Hash className="w-3.5 h-3.5 text-zinc-500 mr-1.5 shrink-0" />
                            <input
                              type="number"
                              min="0"
                              value={startContactIndex}
                              onChange={(e) => setStartContactIndex(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full bg-transparent text-white focus:outline-none font-mono text-xs"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-tight">
                        Format Nama: <span className="text-emerald-400 font-semibold">{contactPrefix} {formatContactIndex(startContactIndex)}, {contactPrefix} {formatContactIndex(startContactIndex + 1)}, {contactPrefix} {formatContactIndex(startContactIndex + 2)}</span>
                      </p>
                    </div>
                  </div>

                  {/* File Name */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      03. Nama File Output
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                        <FileText className="w-4 h-4 text-zinc-600 mr-3 shrink-0" />
                        <input
                          type="text"
                          value={fileName}
                          onChange={(e) => setFileName(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, ''))}
                          placeholder="Nama file..."
                          className="flex-1 bg-transparent text-white placeholder-zinc-700 focus:outline-none font-medium text-sm"
                        />
                        <span className="text-zinc-600 font-mono text-xs ml-2">{isSplit ? '[nomor].vcf' : '.vcf'}</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-tight italic">
                        {isSplit
                          ? `Contoh: ${fileName || 'lead_database'} ${formatFileIndex(startFileNumber, startFileNumber + 10, useZeroPadding)}.vcf`
                          : `Format: ${fileName || 'lead_database'}.vcf`}
                      </p>
                    </div>
                  </div>

                  {/* Special Groups (Admin, Navy, etc) */}
                  {mode === AppMode.NUM_TO_VCF && (
                    <div className="col-span-1 sm:col-span-2 flex flex-col gap-2">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
                          Group Contacts (Admin, Navy, etc)
                        </label>
                        <button
                          onClick={addSpecialGroup}
                          className="text-[9px] font-bold text-amber-500 hover:text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all"
                        >
                          + Tambah Grup
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {specialGroups.map((group) => (
                          <div
                            key={group.id}
                            className={`p-4 rounded-2xl border transition-all ${group.active ? 'bg-amber-500/5 border-amber-500/30' : 'bg-zinc-900 border-zinc-800'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <input
                                type="text"
                                placeholder="Nama Grup (cth: Admin)"
                                value={group.label}
                                onChange={(e) => updateSpecialGroup(group.id, 'label', e.target.value)}
                                className="bg-transparent border-none text-white font-bold text-sm focus:outline-none placeholder:text-zinc-700 w-full mr-2"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateSpecialGroup(group.id, 'active', !group.active)}
                                  className={`w-8 h-4 rounded-full relative transition-all ${group.active ? 'bg-amber-500' : 'bg-zinc-800'}`}
                                >
                                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${group.active ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                                <button
                                  onClick={() => removeSpecialGroup(group.id)}
                                  className="text-zinc-600 hover:text-red-400 transition-all p-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <textarea
                              placeholder="Masukkan nomor (satu per baris)..."
                              value={group.numbers}
                              onChange={(e) => {
                                const filtered = e.target.value.replace(/[^0-9\n\r,;+]/g, '');
                                updateSpecialGroup(group.id, 'numbers', filtered);
                              }}
                              className="w-full h-20 bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-3 text-[10px] text-zinc-400 font-mono focus:outline-none focus:border-amber-500/30 resize-none transition-all"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Splitting Section with Sorting Algorithm Controls */}
                  <div className="col-span-1 sm:col-span-2 flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      04. Pengaturan Pisah File & Sorting Ascending
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-4">
                      {/* Toggle Pisah File */}
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                        <div>
                          <span className="text-xs font-bold text-zinc-200">Aktifkan Pemecahan File (Splitting)</span>
                          <p className="text-[11px] text-zinc-500">Bagi kontak ke beberapa berkas .vcf terurut</p>
                        </div>
                        <button
                          onClick={() => setIsSplit(!isSplit)}
                          className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${isSplit ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isSplit ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      {/* Sorting Algorithm & Zero Padding Switches */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                              <ArrowDown10 className="w-4 h-4 text-emerald-400" />
                              Urut Ascending (1-2-3-4)
                            </span>
                            <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Nomor diurutkan kecil ke besar</p>
                          </div>
                          <button
                            onClick={() => setSortAscending(!sortAscending)}
                            className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${sortAscending ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${sortAscending ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>

                        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-emerald-400" />
                              Penomoran Rapi (01, 02..)
                            </span>
                            <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Nama urut sempurna di memori HP/PC</p>
                          </div>
                          <button
                            onClick={() => setUseZeroPadding(!useZeroPadding)}
                            className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${useZeroPadding ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useZeroPadding ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Splitting Controls */}
                      <AnimatePresence>
                        {isSplit && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4 overflow-hidden pt-2 border-t border-zinc-800/60"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-zinc-300">Jumlah Kontak per File</label>
                                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                    {splitSize} kontak/file
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  min="1"
                                  value={splitSize}
                                  onChange={(e) => setSplitSize(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-emerald-500/50 text-sm"
                                />
                                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                  <span className="text-[9px] uppercase font-bold text-zinc-600">Preset:</span>
                                  {[100, 250, 500, 1000].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => setSplitSize(preset)}
                                      className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                                        splitSize === preset
                                          ? 'bg-emerald-500 text-zinc-950 font-bold border-emerald-400'
                                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                      }`}
                                    >
                                      {preset}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-zinc-300">Start File Number</label>
                                  <span className="text-[10px] font-mono text-zinc-500">Mulai #{startFileNumber}</span>
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  value={startFileNumber}
                                  onChange={(e) => setStartFileNumber(Math.max(0, parseInt(e.target.value) || 0))}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-emerald-500/50 text-sm"
                                />
                                <p className="text-[11px] text-zinc-600 leading-tight italic pt-1">
                                  Nomor awal file (contoh: mulai #{startFileNumber})
                                </p>
                              </div>
                            </div>

                            {/* Dynamic Estimation Card */}
                            <div className="bg-gradient-to-r from-emerald-500/10 via-zinc-900 to-zinc-900 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                  <Layers className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-white">
                                    Estimasi: {count > 0 ? Math.ceil(count / splitSize) : 0} File VCF (Urutan Ascending)
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    {count > 0
                                      ? `Rentang nama: ${fileName || 'lead_database'} ${formatFileIndex(startFileNumber, startFileNumber + Math.ceil(count / splitSize) - 1, useZeroPadding)}.vcf s/d ${fileName || 'lead_database'} ${formatFileIndex(startFileNumber + Math.ceil(count / splitSize) - 1, startFileNumber + Math.ceil(count / splitSize) - 1, useZeroPadding)}.vcf`
                                      : 'Masukkan nomor untuk melihat kalkulasi pembagian'}
                                  </div>
                                </div>
                              </div>
                              {count > 0 && (
                                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30 shrink-0">
                                  {count} Kontak
                                </span>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 3: VCF_TO_TXT */}
              {mode === AppMode.VCF_TO_TXT && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="col-span-1 sm:col-span-2 flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      02. Nama File Output (.txt)
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                        <FileText className="w-4 h-4 text-zinc-600 mr-3 shrink-0" />
                        <input
                          type="text"
                          value={txtOutputName}
                          onChange={(e) => setTxtOutputName(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, ''))}
                          placeholder="Nama file..."
                          className="flex-1 bg-transparent text-white placeholder-zinc-700 focus:outline-none font-medium text-sm"
                        />
                        <span className="text-zinc-600 font-mono text-xs ml-2">{isTxtSplit ? '[nomor].txt' : '.txt'}</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-tight italic">
                        {isTxtSplit
                          ? `Format: ${txtOutputName || 'extracted_numbers'} ${formatFileIndex(txtStartFileNumber, txtStartFileNumber + 10, useZeroPadding)}.txt, dst.`
                          : `Format: ${txtOutputName || 'extracted_numbers'}.txt`}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-2 flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      03. Pengaturan Pisah File & Sorting Ascending
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-4">
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                        <div>
                          <span className="text-xs font-bold text-zinc-200">Pisah Nomor ke Beberapa File TXT</span>
                          <p className="text-[11px] text-zinc-500">Bagi daftar nomor ke beberapa berkas .txt terurut</p>
                        </div>
                        <button
                          onClick={() => setIsTxtSplit(!isTxtSplit)}
                          className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${isTxtSplit ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isTxtSplit ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                              <ArrowDown10 className="w-4 h-4 text-emerald-400" />
                              Urut Ascending (1-2-3-4)
                            </span>
                            <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Nomor diurutkan terkecil ke terbesar</p>
                          </div>
                          <button
                            onClick={() => setSortAscending(!sortAscending)}
                            className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${sortAscending ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${sortAscending ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>

                        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-2xl p-3 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-emerald-400" />
                              Penomoran Rapi (01, 02..)
                            </span>
                            <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Penamaan urut di penyimpanan HP/PC</p>
                          </div>
                          <button
                            onClick={() => setUseZeroPadding(!useZeroPadding)}
                            className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${useZeroPadding ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useZeroPadding ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {isTxtSplit && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-4 overflow-hidden pt-2 border-t border-zinc-800/60"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-zinc-300">Nomor per File TXT</label>
                                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                                    {txtSplitSize} nomor/file
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  min="1"
                                  value={txtSplitSize}
                                  onChange={(e) => setTxtSplitSize(Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-emerald-500/50 text-sm"
                                />
                                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                  <span className="text-[9px] uppercase font-bold text-zinc-600">Preset:</span>
                                  {[100, 250, 500, 1000].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => setTxtSplitSize(preset)}
                                      className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                                        txtSplitSize === preset
                                          ? 'bg-emerald-500 text-zinc-950 font-bold border-emerald-400'
                                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                                      }`}
                                    >
                                      {preset}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-zinc-300">Start File Number</label>
                                  <span className="text-[10px] font-mono text-zinc-500">Mulai #{txtStartFileNumber}</span>
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  value={txtStartFileNumber}
                                  onChange={(e) => setTxtStartFileNumber(Math.max(0, parseInt(e.target.value) || 0))}
                                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-emerald-500/50 text-sm"
                                />
                                <p className="text-[11px] text-zinc-600 leading-tight italic pt-1">
                                  Nomor awal file (contoh: #{txtStartFileNumber})
                                </p>
                              </div>
                            </div>

                            <div className="bg-gradient-to-r from-emerald-500/10 via-zinc-900 to-zinc-900 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                                  <Layers className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-white">
                                    Estimasi: {count > 0 ? Math.ceil(count / txtSplitSize) : 0} File TXT
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    {count > 0
                                      ? `Rentang nama: ${txtOutputName || 'extracted_numbers'} ${formatFileIndex(txtStartFileNumber, txtStartFileNumber + Math.ceil(count / txtSplitSize) - 1, useZeroPadding)}.txt s/d ${txtOutputName || 'extracted_numbers'} ${formatFileIndex(txtStartFileNumber + Math.ceil(count / txtSplitSize) - 1, txtStartFileNumber + Math.ceil(count / txtSplitSize) - 1, useZeroPadding)}.txt`
                                      : 'Unggah file .vcf untuk melihat kalkulasi pembagian'}
                                  </div>
                                </div>
                              </div>
                              {count > 0 && (
                                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30 shrink-0">
                                  {count} Nomor
                                </span>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 4: SPLIT_VCF */}
              {mode === AppMode.SPLIT_VCF && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="col-span-1 sm:col-span-2 flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      02. Nama File Hasil Split (.vcf)
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                        <FileText className="w-4 h-4 text-zinc-600 mr-3 shrink-0" />
                        <input
                          type="text"
                          value={splitFileName}
                          onChange={(e) => setSplitFileName(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, ''))}
                          placeholder="Nama file..."
                          className="flex-1 bg-transparent text-white placeholder-zinc-700 focus:outline-none font-medium text-sm"
                        />
                        <span className="text-zinc-600 font-mono text-xs ml-2">[nomor].vcf</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-tight italic">
                        Contoh: {splitFileName || 'kontak'} ${formatFileIndex(splitStartNumber, splitStartNumber + 10, useZeroPadding)}.vcf, dst.
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                          <ArrowDown10 className="w-3.5 h-3.5 text-emerald-400" />
                          Urut Ascending
                        </span>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Urutkan kontak A-Z / 1-4</p>
                      </div>
                      <button
                        onClick={() => setSortAscending(!sortAscending)}
                        className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${sortAscending ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${sortAscending ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-emerald-400" />
                          Nomor 01, 02..
                        </span>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Penamaan rapi memori</p>
                      </div>
                      <button
                        onClick={() => setUseZeroPadding(!useZeroPadding)}
                        className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${useZeroPadding ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useZeroPadding ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                          Rename 001..
                        </span>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Ganti nama ke 001, 002</p>
                      </div>
                      <button
                        onClick={() => setRenameVcfContacts(!renameVcfContacts)}
                        className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${renameVcfContacts ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${renameVcfContacts ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      03. Jumlah Kontak per File
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <input
                        type="number"
                        min="1"
                        value={splitContactsPerFile}
                        onChange={(e) => setSplitContactsPerFile(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-emerald-500/50 text-sm"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[100, 250, 500, 1000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSplitContactsPerFile(preset)}
                            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                              splitContactsPerFile === preset
                                ? 'bg-emerald-500 text-zinc-950 font-bold border-emerald-400'
                                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 ml-1">
                      04. Start File Number
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <input
                        type="number"
                        min="0"
                        value={splitStartNumber}
                        onChange={(e) => setSplitStartNumber(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-emerald-500/50 text-sm"
                      />
                      <p className="text-[11px] text-zinc-600 leading-tight italic">
                        Nomor awal penamaan (contoh: mulai #{splitStartNumber})
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-2 bg-gradient-to-r from-emerald-500/10 via-zinc-900 to-zinc-900 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          Estimasi: {splitCards.length > 0 ? Math.ceil(splitCards.length / splitContactsPerFile) : 0} File VCF
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {splitCards.length > 0
                            ? `Rentang file: ${splitFileName || 'kontak'} ${formatFileIndex(splitStartNumber, splitStartNumber + Math.ceil(splitCards.length / splitContactsPerFile) - 1, useZeroPadding)}.vcf s/d ${splitFileName || 'kontak'} ${formatFileIndex(splitStartNumber + Math.ceil(splitCards.length / splitContactsPerFile) - 1, splitStartNumber + Math.ceil(splitCards.length / splitContactsPerFile) - 1, useZeroPadding)}.vcf`
                            : 'Masukkan file .vcf untuk melihat kalkulasi pembagian'}
                        </div>
                      </div>
                    </div>
                    {splitCards.length > 0 && (
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/30 shrink-0">
                        {splitCards.length} Kontak
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* MODE 5: SPLIT_TXT (PECAH FILE TXT) */}
              {mode === AppMode.SPLIT_TXT && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="col-span-1 sm:col-span-2 flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 ml-1">
                      02. Nama File Hasil Split (.txt)
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5">
                        <FileText className="w-4 h-4 text-zinc-600 mr-3 shrink-0" />
                        <input
                          type="text"
                          value={splitTxtFileName}
                          onChange={(e) => setSplitTxtFileName(e.target.value.replace(/[^a-zA-Z0-9 _-]/g, ''))}
                          placeholder="Nama file..."
                          className="flex-1 bg-transparent text-white placeholder-zinc-700 focus:outline-none font-medium text-sm"
                        />
                        <span className="text-zinc-600 font-mono text-xs ml-2">[nomor].txt</span>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-tight italic">
                        Contoh: {splitTxtFileName || 'nomor'} {formatFileIndex(splitTxtStartNumber, splitTxtStartNumber + 10, useZeroPadding)}.txt, dst.
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                          <ArrowDown10 className="w-4 h-4 text-sky-400" />
                          Urut Ascending (1-2-3-4)
                        </span>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Nomor urut dari kecil ke besar</p>
                      </div>
                      <button
                        onClick={() => setSortAscending(!sortAscending)}
                        className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${sortAscending ? 'bg-sky-500' : 'bg-zinc-800'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${sortAscending ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-sky-400" />
                          Penomoran Rapi (01, 02..)
                        </span>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">Nama urut rapi di memori HP/PC</p>
                      </div>
                      <button
                        onClick={() => setUseZeroPadding(!useZeroPadding)}
                        className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${useZeroPadding ? 'bg-sky-500' : 'bg-zinc-800'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${useZeroPadding ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 ml-1">
                      03. Jumlah Nomor per File
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <input
                        type="number"
                        min="1"
                        value={splitTxtSize}
                        onChange={(e) => setSplitTxtSize(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-sky-500/50 text-sm"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[100, 250, 500, 1000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setSplitTxtSize(preset)}
                            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                              splitTxtSize === preset
                                ? 'bg-sky-500 text-zinc-950 font-bold border-sky-400'
                                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400 ml-1">
                      04. Start File Number
                    </label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-3">
                      <input
                        type="number"
                        min="0"
                        value={splitTxtStartNumber}
                        onChange={(e) => setSplitTxtStartNumber(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-sky-500/50 text-sm"
                      />
                      <p className="text-[11px] text-zinc-600 leading-tight italic">
                        Nomor awal penamaan (contoh: mulai #{splitTxtStartNumber})
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1 sm:col-span-2 bg-gradient-to-r from-sky-500/10 via-zinc-900 to-zinc-900 border border-sky-500/20 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          Estimasi: {count > 0 ? Math.ceil(count / splitTxtSize) : 0} File TXT
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {count > 0
                            ? `Rentang file: ${splitTxtFileName || 'nomor'} ${formatFileIndex(splitTxtStartNumber, splitTxtStartNumber + Math.ceil(count / splitTxtSize) - 1, useZeroPadding)}.txt s/d ${splitTxtFileName || 'nomor'} ${formatFileIndex(splitTxtStartNumber + Math.ceil(count / splitTxtSize) - 1, splitTxtStartNumber + Math.ceil(count / splitTxtSize) - 1, useZeroPadding)}.txt`
                            : 'Masukkan nomor untuk melihat kalkulasi pembagian'}
                        </div>
                      </div>
                    </div>
                    {count > 0 && (
                      <span className="text-xs font-mono font-bold text-sky-400 bg-sky-500/20 px-3 py-1 rounded-lg border border-sky-500/30 shrink-0">
                        {count} Nomor
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Button & Error */}
              <div className="flex-1 flex flex-col justify-end gap-3 min-h-[90px]">
                <AnimatePresence mode="wait">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-red-500/10 border border-red-500/20 text-red-500 p-3.5 rounded-2xl flex items-center gap-3 text-xs font-semibold"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <p>{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={
                    mode === AppMode.VCF_TO_TXT
                      ? handleExtractTxt
                      : mode === AppMode.SPLIT_VCF
                        ? handleSplitVcf
                        : mode === AppMode.SPLIT_TXT
                          ? handleSplitTxt
                          : handleConvert
                  }
                  disabled={
                    isSuccess ||
                    (mode === AppMode.VCF_TO_TXT && !extractedNumbers) ||
                    (mode === AppMode.SPLIT_VCF && (!splitVcfFile || splitCards.length === 0)) ||
                    (mode === AppMode.SPLIT_TXT && count === 0) ||
                    ((mode === AppMode.NUM_TO_VCF || mode === AppMode.TXT_TO_VCF) && !phoneNumbers && !specialGroups.some(g => g.active && g.numbers))
                  }
                  className={`group relative w-full h-20 rounded-3xl transition-all duration-500 flex items-center justify-center gap-4 overflow-hidden shadow-2xl ${
                    isSuccess
                      ? 'bg-zinc-800 text-emerald-500 cursor-default shadow-zinc-950'
                      : (
                        (mode === AppMode.VCF_TO_TXT && !extractedNumbers) ||
                        (mode === AppMode.SPLIT_VCF && (!splitVcfFile || splitCards.length === 0)) ||
                        (mode === AppMode.SPLIT_TXT && count === 0) ||
                        ((mode === AppMode.NUM_TO_VCF || mode === AppMode.TXT_TO_VCF) && !phoneNumbers && !specialGroups.some(g => g.active && g.numbers))
                      )
                        ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-zinc-800'
                        : mode === AppMode.SPLIT_TXT
                          ? 'bg-sky-500 hover:bg-sky-400 text-zinc-950 shadow-sky-500/20'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20'
                  }`}
                >
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                  {isSuccess ? (
                    <CheckCircle2 className="w-9 h-9" />
                  ) : mode === AppMode.VCF_TO_TXT ? (
                    <FileDown className="w-7 h-7 animate-pulse" />
                  ) : (mode === AppMode.SPLIT_VCF || mode === AppMode.SPLIT_TXT) ? (
                    <Scissors className="w-7 h-7 animate-pulse" />
                  ) : (
                    <Download className="w-7 h-7 animate-bounce" />
                  )}

                  <div className="text-left">
                    <span className="block text-lg font-black uppercase tracking-tighter leading-none mb-1">
                      {isSuccess
                        ? 'Selesai!'
                        : mode === AppMode.VCF_TO_TXT
                          ? 'Mulai / Ekstrak ke TXT'
                          : mode === AppMode.SPLIT_VCF
                            ? 'Mulai / Split VCF'
                            : mode === AppMode.SPLIT_TXT
                              ? 'Mulai / Split TXT'
                              : mode === AppMode.TXT_TO_VCF
                                ? 'Mulai / Konversi ke VCF'
                                : 'Mulai / Buat VCF'}
                    </span>
                    <span className="block text-[10px] font-bold opacity-60 uppercase tracking-widest">
                      {mode === AppMode.SPLIT_TXT
                        ? 'Bagi berkas TXT mulai dari 1 - 2 - 3 - 4 & share Telegram (iOS)'
                        : mode === AppMode.VCF_TO_TXT
                          ? isTxtSplit ? 'Bagi nomor ke beberapa file TXT (Urutan Ascending 1-2-3-4)' : 'Ekstrak nomor & opsi share Telegram (iOS)'
                          : mode === AppMode.SPLIT_VCF
                            ? 'Bagi kontak mulai dari 1 - 2 - 3 - 4 (Ascending)'
                            : isSplit
                              ? 'Bagi kontak mulai dari 1 - 2 - 3 - 4 & share Telegram'
                              : 'Generate VCF (Kontak 001, 002...) & opsi share Telegram'}
                    </span>
                  </div>
                </motion.button>
              </div>

            </div>
          </div>
        </motion.div>
      </main>

      {/* Universal Results & Telegram Share Modal (Active for ALL MODES) */}
      <AnimatePresence>
        {isResultModalOpen && resultFiles && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 md:p-8 flex flex-col gap-5 max-h-[90vh] shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{resultModalTitle}</h2>
                    <p className="text-xs text-zinc-400">{resultModalSubtitle}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsResultModalOpen(false)}
                  className="p-2 text-zinc-500 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Download Progress Banner if downloading */}
              {downloadProgress && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-col gap-2 animate-pulse">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                    <span className="flex items-center gap-2">
                      <Download className="w-4 h-4 animate-bounce" />
                      Sedang Mengunduh ke Penyimpanan...
                    </span>
                    <span className="font-mono">
                      {downloadProgress.current} / {downloadProgress.total} File
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                      style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate">
                    Menyimpan berkas: <span className="text-white font-mono">{downloadProgress.name}</span>
                  </p>
                </div>
              )}

              {/* Status Alert if any */}
              {sharingStatus && (
                <div className="bg-sky-500/10 border border-sky-500/30 text-sky-400 p-3 rounded-2xl text-xs font-medium flex items-center gap-2">
                  <Send className="w-4 h-4 shrink-0" />
                  <span>{sharingStatus}</span>
                </div>
              )}

              {/* Telegram & iOS Highlight Banner */}
              <div className="bg-gradient-to-br from-sky-500/15 via-blue-600/10 to-transparent border border-sky-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#229ED9] text-white flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/20">
                    <TelegramIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">Bagikan ke Telegram</span>
                      <span className="text-[9px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full">
                        Support iOS & Mobile
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                      Kirim langsung berkas ke Telegram secara terurut via iOS Share Sheet.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => shareFilesToTelegram(resultFiles)}
                  disabled={isSharing}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#229ED9] hover:bg-[#1E88E5] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/25 shrink-0"
                >
                  <TelegramIcon className="w-4 h-4" />
                  <span>{isSharing ? 'Membuka...' : 'Bagikan ke Telegram'}</span>
                </button>
              </div>

              {/* iOS Notice & Tips */}
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-3 flex items-start gap-3">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-zinc-400 leading-relaxed">
                  <strong className="text-zinc-200">Tips Penyimpanan:</strong> File telah diurutkan dengan algoritma <em>Natural Ascending Sort</em> (mulai dari 1 - 2 - 3 - 4). Saat mendownload, file akan masuk ke penyimpanan mulai dari nomor terkecil secara berurutan.
                </div>
              </div>

              {/* Action Buttons Bar with Sorting Order Switch */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Daftar Berkas ({resultFiles.length} File)
                  </span>
                  <div className="flex items-center bg-zinc-950 border border-zinc-800 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      onClick={() => setDownloadOrder('asc')}
                      className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${downloadOrder === 'asc' ? 'bg-emerald-500 text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'}`}
                      title="Unduh mulai dari angka kecil ke besar (1 -> 2 -> 3 -> 4)"
                    >
                      <ArrowDown10 className="w-3 h-3" />
                      1 → N
                    </button>
                    <button
                      onClick={() => setDownloadOrder('desc')}
                      className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${downloadOrder === 'desc' ? 'bg-emerald-500 text-zinc-950 font-black' : 'text-zinc-400 hover:text-white'}`}
                      title="Unduh terbalik (N -> 1) agar di HP yang mengurutkan Terbaru file 1 berada paling atas"
                    >
                      <ArrowUp10 className="w-3 h-3" />
                      N → 1
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Copy button for TXT extraction / Split TXT */}
                  {(mode === AppMode.VCF_TO_TXT || mode === AppMode.SPLIT_TXT) && (
                    <button
                      onClick={() => copyToClipboard(mode === AppMode.SPLIT_TXT ? splitTxtContent : extractedNumbers)}
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-zinc-700"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Tersalin!' : 'Salin Nomor'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => downloadAllFiles(resultFiles)}
                    disabled={isDownloadingBatch}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                      isDownloadingBatch
                        ? 'bg-zinc-800 text-zinc-500 border-zinc-800 cursor-not-allowed'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-emerald-400 shadow-lg shadow-emerald-500/10'
                    }`}
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloadingBatch ? 'animate-bounce' : ''}`} />
                    <span>
                      {isDownloadingBatch
                        ? 'Mengunduh...'
                        : `Download Semua (${resultFiles.length} File - Urut ${downloadOrder === 'asc' ? '1 → ' + resultFiles.length : resultFiles.length + ' → 1'})`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Scrollable File List */}
              <div className="overflow-y-auto max-h-[190px] space-y-2 pr-1 divide-y divide-zinc-800/50">
                {(downloadOrder === 'desc' ? [...naturalSortAscending(resultFiles)].reverse() : naturalSortAscending(resultFiles)).map((item, idx) => (
                  <div
                    key={idx}
                    className="pt-2 first:pt-0 flex items-center justify-between gap-3 bg-zinc-950/40 p-3 rounded-2xl border border-zinc-800/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0 font-mono text-xs font-bold">
                        #{downloadOrder === 'desc' ? resultFiles.length - idx : idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {item.count} {item.type} &bull; {(item.blob.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => shareFilesToTelegram([item])}
                        className="p-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/20 transition-all flex items-center gap-1.5 text-xs font-medium"
                        title="Bagikan berkas ini ke Telegram"
                      >
                        <TelegramIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Kirim</span>
                      </button>
                      <button
                        onClick={() => downloadSingleFile(item)}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-all flex items-center gap-1.5 text-xs font-medium"
                        title="Download file ini"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Unduh</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800/80">
                <button
                  onClick={() => setIsResultModalOpen(false)}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-all text-center"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Bar */}
      <footer className="px-8 py-4 border-t border-zinc-900 bg-zinc-950 flex items-center justify-between text-[10px] md:text-[11px] font-medium text-zinc-600 shrink-0">
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            SYSTEM STATUS: <span className="text-emerald-500 font-bold">ONLINE</span>
          </span>
          <span className="hidden sm:inline">FORMAT: CONTACT 001, 002... | NATURAL SORT ASCENDING</span>
        </div>
        <div className="flex gap-4">
          <span className="hidden sm:inline">OFFLINE MODE READY</span>
          <span className="uppercase">&copy; 2026 WEBSITE BY KZ ADIT </span>
        </div>
      </footer>
    </div>
  );
}
