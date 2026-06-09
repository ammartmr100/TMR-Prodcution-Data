import React, { useState, useMemo, useRef } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  Activity, 
  Search, 
  Download, 
  X, 
  ChevronLeft 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Define the CleanRecord interface locally to keep the file self-contained
interface CleanRecord {
  id: string;
  jobId: string;
  department: string;
  partName: string;
  okProduction: number;
  ngParts: number;
  totalProduction: number;
  productionDate: string;
  dateStr: string;
  monthYear: string;
  machine: string;
  operator: string;
  shift: string;
  rubberUsed: number;
  rubberWaste: number;
  time: string;
  targetShots: number;
  activeCavities: number;
  usedCavities: number;
  actualShots: number;
  status: string;
  remarks: string;
}

interface DoubleMachineLossReportProps {
  isOpen: boolean;
  onClose: () => void;
  data: CleanRecord[];
  reportMonthFilter: string;
  availableReportMonths: string[];
  setReportMonthFilter: (month: string) => void;
  partCustomerMap: Map<string, { partName: string; partNo: string; customer: string }>;
}

export default function DoubleMachineLossReport({
  isOpen,
  onClose,
  data,
  reportMonthFilter,
  availableReportMonths,
  setReportMonthFilter,
  partCustomerMap
}: DoubleMachineLossReportProps) {
  const [reportOperatorSearch, setReportOperatorSearch] = useState('');
  const [selectedOperatorsForLossReport, setSelectedOperatorsForLossReport] = useState<string[]>([]);
  const [viewedOperatorForLossReport, setViewedOperatorForLossReport] = useState<string | null>(null);
  const [showMobileLossReport, setShowMobileLossReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Derive double machine loss data (real target, not adjusted)
  const doubleMachineLossData = useMemo(() => {
    const operatorDays: { [key: string]: { [date: string]: CleanRecord[] } } = {};
    
    // Filter data by selected month first
    const monthFilteredData = data.filter(record => {
      return record.monthYear === reportMonthFilter;
    });

    const allowedOperators = [
      "Martha Fiaz", "Rida BiBi", "Kaneez BiBi", "Rukhsana Patrs", 
      "Rukhsana Mohsan", "Shehnaz Munir", "Razia Mushtaq", 
      "Khalida BiBi", "Asia bibi", "Saleem Akram", "Rizwan", 
      "Arslan", "Abdul Raheem"
    ];

    monthFilteredData.forEach(record => {
      const op = record.operator;
      if (!op || !allowedOperators.includes(op)) return;
      const date = record.productionDate;
      if (!operatorDays[op]) operatorDays[op] = {};
      if (!operatorDays[op][date]) operatorDays[op][date] = [];
      operatorDays[op][date].push(record);
    });

    const result: { [operator: string]: { date: string, shift: string, records: CleanRecord[] }[] } = {};

    Object.entries(operatorDays).forEach(([operator, dates]) => {
      const doubleDays = Object.entries(dates).flatMap(([date, records]) => {
        // Group by shift
        const shifts: { [shift: string]: CleanRecord[] } = {};
        records.forEach(r => {
          if (r.shift === 'Night' && operator !== 'Rizwan') return;
          
          if (!shifts[r.shift]) shifts[r.shift] = [];
          shifts[r.shift].push(r);
        });

        // Check each shift for double machines
        return Object.entries(shifts)
          .filter(([shift, shiftRecords]) => {
            const uniqueMachines = new Set(shiftRecords.map(r => r.machine));
            return uniqueMachines.size >= 2;
          })
          .map(([shift, shiftRecords]) => {
            // Real target (no adjustment)
            return { date, shift, records: shiftRecords };
          });
      });

      if (doubleDays.length > 0) {
        result[operator] = doubleDays.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateA - dateB;
        });
      }
    });

    return result;
  }, [data, reportMonthFilter]);

  const handleExportXlsx = async (operators: string[]) => {
    const workbook = new ExcelJS.Workbook();
    
    for (const operator of operators) {
      const worksheet = workbook.addWorksheet(operator.substring(0, 31));
      const opData = doubleMachineLossData[operator];
      if (!opData) continue;
      
      // Column widths
      worksheet.columns = [
        { width: 8 },  // NO
        { width: 20 }, // Date
        { width: 35 }, // Part Name / Column A
        { width: 25 }, // Part No. / Column B
        { width: 20 }, // Customer / Column C
        { width: 12 }, // Target
        { width: 12 }, // Actual
        { width: 14 }, // Loss Target (New)
        { width: 10 }, // %
        { width: 25 }  // Remarks
      ];

      // Header: TM Rubber Pvt. Ltd
      const headerRow = worksheet.addRow(['TM Rubber Pvt. Ltd']);
      worksheet.mergeCells(`A${headerRow.number}:J${headerRow.number}`);
      headerRow.getCell(1).font = { bold: true, size: 16 };
      headerRow.getCell(1).alignment = { horizontal: 'center' };
      headerRow.getCell(1).border = { bottom: { style: 'medium' } };

      // Sub-header: Double Efficiency with Loss Target
      const subHeaderRow = worksheet.addRow([`Double Efficiency with Loss Target For the Month of ${reportMonthFilter}`]);
      worksheet.mergeCells(`A${subHeaderRow.number}:J${subHeaderRow.number}`);
      subHeaderRow.getCell(1).font = { bold: true, italic: true, size: 11 };
      subHeaderRow.getCell(1).alignment = { horizontal: 'center' };

      // Operator Name
      const opNameRow = worksheet.addRow([operator]);
      worksheet.mergeCells(`A${opNameRow.number}:J${opNameRow.number}`);
      opNameRow.getCell(1).font = { bold: true, size: 14, underline: true };
      opNameRow.getCell(1).alignment = { horizontal: 'center' };
      worksheet.addRow([]); // Spacer

      // Approval Section (Side-by-side like App UI with 10 columns)
      const approvalRow = worksheet.addRow(['Confirm By', '', '', 'Approved By', '', '', '', '', '', '']);
      worksheet.mergeCells(`A${approvalRow.number}:B${approvalRow.number}`);
      worksheet.mergeCells(`D${approvalRow.number}:F${approvalRow.number}`);
      worksheet.mergeCells(`G${approvalRow.number}:I${approvalRow.number}`);
      approvalRow.height = 60;
      
      approvalRow.getCell(1).font = { bold: true, size: 10 };
      approvalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      approvalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      
      approvalRow.getCell(4).font = { bold: true, size: 10 };
      approvalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      approvalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

      for (let i = 1; i <= 10; i++) {
        approvalRow.getCell(i).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
      worksheet.addRow([]); // Spacer

      // Summary Totals
      const totalDays = opData.length;
      let totalTarget = 0;
      let totalActual = 0;
      opData.forEach(day => {
        day.records.forEach(r => {
          totalTarget += r.targetShots;
          totalActual += r.actualShots;
        });
      });
      const overallPercent = (totalActual / (totalTarget || 1)) * 100;
      const totalLossTarget = totalActual - totalTarget;

      const summaryRow = worksheet.addRow(['Total Double Machine Days', '', totalDays, '', '', totalTarget, totalActual, totalLossTarget, `${overallPercent.toFixed(2)}%`, '']);
      worksheet.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
      summaryRow.font = { bold: true, size: 10 };
      summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
      summaryRow.height = 25;
      for (let i = 1; i <= 10; i++) {
        const cell = summaryRow.getCell(i);
        cell.border = {
          top: { style: 'medium' },
          left: { style: 'medium' },
          bottom: { style: 'medium' },
          right: { style: 'medium' }
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' }
        };
      }
      worksheet.addRow([]); // Spacer

      // Table Header
      const tableHeader = worksheet.addRow(['NO', 'Date', 'Part Name', 'Part No.', 'Customer', 'Target', 'Actual', 'Loss Target', '%', 'Remarks']);
      tableHeader.font = { bold: true };
      tableHeader.alignment = { horizontal: 'center' };
      tableHeader.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Table Data
      let counter = 1;
      opData.forEach(day => {
        day.records.forEach(record => {
          const percent = (record.actualShots / (record.targetShots || 1)) * 100;
          const lossTarget = record.actualShots - record.targetShots;
          const key = record.partName.trim().toLowerCase();
          const mapping = partCustomerMap.get(key);
          const pName = mapping ? mapping.partName : record.partName;
          const pNo = mapping ? mapping.partNo : '-';
          const customer = mapping ? mapping.customer : '-';
          const row = worksheet.addRow([
            counter++,
            record.productionDate,
            pName,
            pNo,
            customer,
            record.targetShots,
            record.actualShots,
            lossTarget,
            `${percent.toFixed(1)}%`,
            record.remarks || ''
          ]);
          row.alignment = { horizontal: 'center' };
          row.getCell(3).alignment = { horizontal: 'left' };
          row.getCell(4).alignment = { horizontal: 'left' };
          row.getCell(5).alignment = { horizontal: 'left' };
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `double_efficiency_loss_target_reports_${reportMonthFilter.replace(' ', '_')}.xlsx`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center"
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white w-full h-full overflow-hidden flex flex-col"
          >
            <div className="p-3 lg:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 no-print">
              <div className="flex items-center gap-2 lg:gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0">
                  <Activity className="w-4 h-4 lg:w-5 lg:h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm lg:text-lg font-bold text-slate-900 leading-tight truncate">
                    Double Efficiency with Loss Target
                  </h3>
                  <p className="text-[9px] lg:text-[10px] text-slate-500 font-medium hidden sm:block">Operators with real target shots from data sheet (Double Machines)</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 lg:gap-3 no-print">
                {selectedOperatorsForLossReport.length > 0 && (
                  <div className={`${showMobileLossReport ? 'flex' : 'hidden lg:flex'} items-center gap-2`}>
                    <button 
                      onClick={() => handleExportXlsx(selectedOperatorsForLossReport)}
                      className="flex items-center gap-2 px-3 lg:px-4 py-1.5 lg:py-2 bg-emerald-600 text-white rounded-xl text-[10px] lg:text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                      <span className="hidden sm:inline">Export Selected XLSX</span>
                      <span className="sm:hidden">Export</span>
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => {
                    onClose();
                    setSelectedOperatorsForLossReport([]);
                    setViewedOperatorForLossReport(null);
                    setShowMobileLossReport(false);
                  }}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row relative">
              {/* Operator List & Filters */}
              <div className={`w-full lg:w-60 border-r border-slate-100 overflow-y-auto bg-slate-50/30 p-3 pt-2 flex flex-col gap-3 ${showMobileLossReport ? 'hidden lg:flex' : 'flex'}`}>
                <div className="lg:hidden flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Report Selection</h4>
                  <button 
                    onClick={() => {
                      onClose();
                      setShowMobileLossReport(false);
                    }}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1 block">Select Month</label>
                  <select 
                    value={reportMonthFilter}
                    onChange={(e) => {
                      setReportMonthFilter(e.target.value);
                      setSelectedOperatorsForLossReport([]);
                      setViewedOperatorForLossReport(null);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {availableReportMonths.map(month => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1 block">Search Operator</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input 
                      type="text"
                      placeholder="Type name..."
                      value={reportOperatorSearch}
                      onChange={(e) => setReportOperatorSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1 custom-scrollbar">
                  <div className="flex items-center justify-between px-2 mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Operators Found</h4>
                    <div className="flex items-center gap-2">
                      {selectedOperatorsForLossReport.length > 0 && (
                        <button 
                          onClick={() => setShowMobileLossReport(true)}
                          className="lg:hidden px-2 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 cursor-pointer shadow-sm"
                        >
                          View Batch ({selectedOperatorsForLossReport.length})
                        </button>
                      )}
                      <button 
                        onClick={() => {
                          const allOps = Object.keys(doubleMachineLossData).filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase()));
                          if (selectedOperatorsForLossReport.length > 0) {
                            setSelectedOperatorsForLossReport([]);
                          } else {
                            setSelectedOperatorsForLossReport(allOps);
                          }
                        }}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                      >
                        {selectedOperatorsForLossReport.length > 0 ? 'Clear All' : 'Select All'}
                      </button>
                    </div>
                  </div>
                  {Object.keys(doubleMachineLossData)
                    .filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase()))
                    .sort()
                    .map(operator => (
                    <div
                      key={operator}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-3 ${
                        viewedOperatorForLossReport === operator
                          ? 'bg-indigo-50 border-indigo-200' 
                          : 'text-slate-600 hover:bg-white hover:shadow-sm'
                      }`}
                      onClick={() => {
                        setViewedOperatorForLossReport(operator);
                        setShowMobileLossReport(true);
                      }}
                    >
                      <div 
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                          selectedOperatorsForLossReport.includes(operator)
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-white border-slate-300 hover:border-indigo-400'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedOperatorsForLossReport.includes(operator)) {
                            setSelectedOperatorsForLossReport(selectedOperatorsForLossReport.filter(op => op !== operator));
                          } else {
                            setSelectedOperatorsForLossReport([...selectedOperatorsForLossReport, operator]);
                          }
                        }}
                      >
                        {selectedOperatorsForLossReport.includes(operator) && <div className="w-2 h-2 bg-white rounded-sm" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{operator}</div>
                        <div className={`text-[10px] mt-0.5 ${viewedOperatorForLossReport === operator ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {doubleMachineLossData[operator].length} Double Days
                        </div>
                      </div>
                    </div>
                  ))}
                  {Object.keys(doubleMachineLossData).filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase())).length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs italic">No operators found for this month</div>
                  )}
                </div>
              </div>

              {/* Report Content */}
              <div ref={reportRef} className={`flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-100/50 print:bg-white print:p-0 ${showMobileLossReport ? 'block' : 'hidden lg:block'}`}>
                <div className="lg:hidden mb-4 no-print">
                  <button 
                    onClick={() => setShowMobileLossReport(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to Operator List
                  </button>
                </div>
                {viewedOperatorForLossReport || selectedOperatorsForLossReport.length > 0 ? (
                  <div className="space-y-8 print:space-y-0">
                    {viewedOperatorForLossReport && (
                      <div className="no-print mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                          <p className="text-sm font-bold text-indigo-900">Viewing: {viewedOperatorForLossReport}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedOperatorsForLossReport.length > 0 && (
                            <button 
                              onClick={() => setViewedOperatorForLossReport(null)}
                              className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer"
                            >
                              Back to Batch ({selectedOperatorsForLossReport.length})
                            </button>
                          )}
                          <button 
                            onClick={() => handleExportXlsx([viewedOperatorForLossReport])}
                            className="px-3 py-1.5 bg-white text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-50 transition-all flex items-center gap-2 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export This
                          </button>
                          {!selectedOperatorsForLossReport.includes(viewedOperatorForLossReport) && (
                            <button 
                              onClick={() => {
                                setSelectedOperatorsForLossReport([...selectedOperatorsForLossReport, viewedOperatorForLossReport]);
                              }}
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer"
                            >
                              Add to Batch
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Determine which operators to display */}
                    {(viewedOperatorForLossReport ? [viewedOperatorForLossReport] : selectedOperatorsForLossReport).map((operator, opIdx, arr) => (
                      <div 
                        key={operator} 
                        className={`bg-white shadow-xl border border-slate-200 rounded-sm p-8 mx-auto max-w-[95%] font-calibri text-black min-h-[1000px] print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:max-w-none print:min-h-0 ${opIdx < arr.length - 1 ? 'page-break' : ''}`}
                      >
                        {/* Excel Style Header */}
                        <div className="text-center mb-6">
                          <h1 className="text-2xl font-bold border-b-2 border-black inline-block px-8 pb-2 mb-3">TM Rubber Pvt. Ltd</h1>
                          <p className="text-sm italic font-bold mb-1">Double Efficiency with Loss Target For the Month of {reportMonthFilter}</p>
                          <p className="text-xl font-bold underline underline-offset-4">{operator}</p>
                        </div>

                        {/* Summary Totals */}
                        {(() => {
                          const opData = doubleMachineLossData[operator];
                          const totalDays = opData.length;
                          let totalTarget = 0;
                          let totalActual = 0;
                          opData.forEach(day => {
                            day.records.forEach(r => {
                              totalTarget += r.targetShots;
                              totalActual += r.actualShots;
                            });
                          });
                          const overallPercent = (totalActual / (totalTarget || 1)) * 100;
                          const totalLossTarget = totalActual - totalTarget;

                          return (
                            <div className="grid grid-cols-10 border-2 border-black mb-4 text-center font-bold text-xs">
                              <div className="col-span-3 p-2 border-r-2 border-black bg-slate-50 uppercase tracking-wider">Total Double Machine Days</div>
                              <div className="col-span-2 p-2 border-r-2 border-black text-xl">{totalDays}</div>
                              <div className="col-span-5 p-2 bg-slate-50 uppercase tracking-wider flex items-center justify-center gap-4">
                                <div className="text-[10px] text-slate-500">Target: {totalTarget.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-500">Actual: {totalActual.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-500 text-red-600">Loss Target: {totalLossTarget.toLocaleString()}</div>
                                <div className="text-indigo-600 font-black">{overallPercent.toFixed(2)}%</div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Main Table */}
                        <table className="w-full border-collapse border-2 border-black text-[11px] font-bold">
                          <thead>
                            <tr className="bg-slate-50 font-black">
                              <th className="border-2 border-black p-2 w-10 text-center">NO</th>
                              <th className="border-2 border-black p-2 w-24 text-center">Date</th>
                              <th className="border-2 border-black p-2 text-left">Part Name</th>
                              <th className="border-2 border-black p-2 text-left">Part No.</th>
                              <th className="border-2 border-black p-2 text-left">Customer</th>
                              <th className="border-2 border-black p-2 w-20 text-center">Target</th>
                              <th className="border-2 border-black p-2 w-20 text-center">Actual</th>
                              <th className="border-2 border-black p-2 w-24 text-center">Loss Target</th>
                              <th className="border-2 border-black p-2 w-16 text-center">%</th>
                              <th className="border-2 border-black p-2 text-left">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let counter = 1;
                              return doubleMachineLossData[operator].map((day) => (
                                <React.Fragment key={`${day.date}-${day.shift}`}>
                                  {day.records.map((record, rIdx) => {
                                    const percent = (record.actualShots / (record.targetShots || 1)) * 100;
                                    const lossTarget = record.actualShots - record.targetShots;
                                    const key = record.partName.trim().toLowerCase();
                                    const mapping = partCustomerMap.get(key);
                                    const pName = mapping ? mapping.partName : record.partName;
                                    const pNo = mapping ? mapping.partNo : '-';
                                    const customer = mapping ? mapping.customer : '-';
                                    return (
                                      <tr key={`${day.date}-${day.shift}-${rIdx}`} className="hover:bg-slate-50 border-b-2 border-black">
                                        <td className="border-2 border-black p-2 text-center">{counter++}</td>
                                        <td className="border-2 border-black p-2 text-center">{record.productionDate}</td>
                                        <td className="border-2 border-black p-2 uppercase text-left">{pName}</td>
                                        <td className="border-2 border-black p-2 uppercase text-left font-mono">{pNo}</td>
                                        <td className="border-2 border-black p-2 uppercase text-left">{customer}</td>
                                        <td className="border-2 border-black p-2 text-center font-mono">{record.targetShots.toLocaleString()}</td>
                                        <td className="border-2 border-black p-2 text-center font-mono">{record.actualShots.toLocaleString()}</td>
                                        <td className="border-2 border-black p-2 text-center font-mono">{lossTarget.toLocaleString()}</td>
                                        <td className="border-2 border-black p-2 text-center font-black">{percent.toFixed(1)}%</td>
                                        <td className="border-2 border-black p-2">{record.remarks || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <Activity className="w-16 h-16 opacity-20" />
                    <p className="text-lg font-medium">Select an operator from the left to view their report</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
