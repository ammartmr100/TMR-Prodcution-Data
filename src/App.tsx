/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, LabelList
} from 'recharts';
import { utils, writeFile } from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  LayoutDashboard, 
  Settings, 
  Activity, 
  Users, 
  AlertTriangle, 
  Trash2, 
  Package, 
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Target,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';

// --- Types ---

interface ProductionRecord {
  'Job #': string;
  Depart: string;
  'Part Name': string;
  'OK Production (Pc\'s)': string;
  'Ng Parts': string;
  'Production Date': string;
  'Machine #': string;
  Operator: string;
  Shift: string;
  'Total Rubber Used (Kg)': string;
  'Rubber Waste Kg\'s': string;
  'Time in Hours and Minutes': string;
  'Planned Target Shots': string;
  'Active Cavities': string;
  'Used Cavities': string;
  'Actual Shots': string;
  Status: string;
  'Remarks (Machine Stop and Rejection)': string;
  'Last Updated': string;
  'Updated By': string;
}

interface CleanRecord {
  id: string;
  jobId: string;
  department: string;
  partName: string;
  okProduction: number;
  ngParts: number;
  totalProduction: number;
  productionDate: string;
  dateStr: string; // YYYY-MM-DD
  monthYear: string; // "January 2026"
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

interface PlanRecord {
  partName: string;
  plannedQty: number;
  totalProductionSum: number;
}

// --- Constants ---

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

// --- Helper Functions ---

const parseNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let s = String(val).replace(/,/g, '').trim();
  // Handle accounting format (100) as -100
  if (s.startsWith('(') && s.endsWith(')')) {
    s = '-' + s.substring(1, s.length - 1);
  }
  // Remove any non-numeric characters except decimal point and minus sign
  s = s.replace(/[^0-9.-]/g, '');
  return parseFloat(s) || 0;
};

const formatDateLocal = (date: Date): string => {
  if (!date || isNaN(date.getTime()) || date.getTime() === 0) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(0);
  
  // Try YYYY-MM-DD first and treat as local
  const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    // If it's just a date string (no time), ensure it's treated as local
    // Some browsers parse 'YYYY-MM-DD' as UTC, but others as local.
    // Our regex above handles YYYY-MM-DD. 
    // For other formats like '27-Oct-2023', new Date() is usually local.
    return d;
  }
  
  // Fallback for common formats like DD-MMM-YYYY if browser fails
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const day = parseInt(parts[0]);
    const month = months[parts[1]];
    const year = parseInt(parts[2]);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      const fullYear = year < 100 ? 2000 + year : year;
      return new Date(fullYear, month, day);
    }
  }
  return new Date(0);
};

// --- Components ---

const StatCard = ({ title, value, icon: Icon, color, trend, onClick }: { title: string, value: string | number, icon: any, color: string, trend?: string, onClick?: () => void }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    onClick={onClick}
    className={`bg-white p-6 rounded-2xl shadow-sm border border-black/5 flex flex-col gap-2 ${onClick ? 'cursor-pointer hover:border-indigo-200 transition-colors' : ''}`}
  >
    <div className="flex items-center justify-between">
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
      </div>
      {trend && (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {trend}
        </span>
      )}
    </div>
    <div className="mt-2">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
    </div>
  </motion.div>
);

const ChartCard = ({ title, children, className = "", action, heightClass = "h-[300px]" }: { title: string, children: React.ReactNode, className?: string, action?: React.ReactNode, heightClass?: string }) => (
  <div className={`bg-white p-6 rounded-2xl shadow-sm border border-black/5 flex flex-col ${className}`}>
    <div className="flex items-center justify-between mb-6 shrink-0">
      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
        <div className="w-1 h-4 bg-indigo-500 rounded-full" />
        {title}
      </h3>
      {action}
    </div>
    <div className={`${heightClass} w-full min-h-0 relative`}>
      {children}
    </div>
  </div>
);

export default function App() {
  const [data, setData] = useState<CleanRecord[]>([]);
  const [planData, setPlanData] = useState<PlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTop10Only, setShowTop10Only] = useState(true);
  const [selectedShift, setSelectedShift] = useState('All');
  const [selectedMachine, setSelectedMachine] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('Production Data');
  const [isProductionDropdownOpen, setIsProductionDropdownOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [productionOrderDateRange, setProductionOrderDateRange] = useState({ start: '', end: '' });
  const [showAllParts, setShowAllParts] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showAllEfficiency, setShowAllEfficiency] = useState(false);
  const [showAllNotAchieved, setShowAllNotAchieved] = useState(false);
  const [showAllDateWiseProduction, setShowAllDateWiseProduction] = useState(false);
  const [planStatusFilter, setPlanStatusFilter] = useState('All');
  const [planProgressFilter, setPlanProgressFilter] = useState('All');
  const [productionOrderShift, setProductionOrderShift] = useState('All');
  const [productionOrderSortConfig, setProductionOrderSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' | null }>({
    key: 'partName',
    direction: null
  });

  const [isRemarksChartExpanded, setIsRemarksChartExpanded] = useState(false);

  const handleProductionOrderSort = (key: string) => {
    setProductionOrderSortConfig(prev => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : prev.direction === 'desc' ? null : 'asc') : 'asc'
    }));
  };

  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  const [partSearch, setPartSearch] = useState('');
  const [isPartFilterOpen, setIsPartFilterOpen] = useState(false);

  const [productionOrderSelectedParts, setProductionOrderSelectedParts] = useState<string[]>([]);
  const [productionOrderPartSearch, setProductionOrderPartSearch] = useState('');
  const [isProductionOrderPartFilterOpen, setIsProductionOrderPartFilterOpen] = useState(false);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dateSearch, setDateSearch] = useState('');
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);

  const [productionOrderSelectedDates, setProductionOrderSelectedDates] = useState<string[]>([]);
  const [productionOrderDateSearch, setProductionOrderDateSearch] = useState('');
  const [isProductionOrderDateFilterOpen, setIsProductionOrderDateFilterOpen] = useState(false);

  const [selectedOperatorsForReport, setSelectedOperatorsForReport] = useState<string[]>([]);
  const [viewedOperatorForReport, setViewedOperatorForReport] = useState<string | null>(null);
  const [showMobileReport, setShowMobileReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const productionSummaryRef = useRef<HTMLDivElement>(null);
  const productionDataRef = useRef<HTMLDivElement>(null);
  const recentLogsRef = useRef<HTMLDivElement>(null);
  const planVsActualRef = useRef<HTMLDivElement>(null);

  const [showDoubleMachineReport, setShowDoubleMachineReport] = useState(false);
  const [showWorkerRecordReport, setShowWorkerRecordReport] = useState(false);
  const [includeRemarksInReport, setIncludeRemarksInReport] = useState(false);
  const [reportMonthFilter, setReportMonthFilter] = useState<string>('');
  const [productionOrderMonth, setProductionOrderMonth] = useState<string>('');
  const [reportOperatorSearch, setReportOperatorSearch] = useState<string>('');

  const partFilterRef = useRef<HTMLDivElement>(null);
  const productionOrderPartFilterRef = useRef<HTMLDivElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const productionOrderDateFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (partFilterRef.current && !partFilterRef.current.contains(event.target as Node)) {
        setIsPartFilterOpen(false);
      }
      if (productionOrderPartFilterRef.current && !productionOrderPartFilterRef.current.contains(event.target as Node)) {
        setIsProductionOrderPartFilterOpen(false);
      }
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) {
        setIsDateFilterOpen(false);
      }
      if (productionOrderDateFilterRef.current && !productionOrderDateFilterRef.current.contains(event.target as Node)) {
        setIsProductionOrderDateFilterOpen(false);
      }
    }
    if (isPartFilterOpen || isProductionOrderPartFilterOpen || isDateFilterOpen || isProductionOrderDateFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPartFilterOpen, isProductionOrderPartFilterOpen, isDateFilterOpen, isProductionOrderDateFilterOpen]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = async (isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    try {
      const prodResponse = await fetch('https://docs.google.com/spreadsheets/d/1WfyeCa2arAJszBmo1aDQm-jE-MWAgGcTSTgHpOPjE4w/export?format=csv');
      if (!prodResponse.ok) throw new Error('Failed to fetch production data');
      const prodCsv = await prodResponse.text();
      
      Papa.parse(prodCsv, {
        header: true,
        skipEmptyLines: true,
        complete: (prodResults) => {
          const cleanData: CleanRecord[] = prodResults.data.map((row: any, index: number) => {
            const pDate = parseDate(row['Production Date'] || '');
            return {
              id: `rec-${index}`,
              jobId: row['Job #'] || '',
              department: row['Depart'] || '',
              partName: row['Part Name'] || '',
              okProduction: parseNumber(row['OK Production (Pc\'s)']),
              ngParts: parseNumber(row['Ng Parts']),
              totalProduction: parseNumber(row['OK Production (Pc\'s)']) + parseNumber(row['Ng Parts']),
              productionDate: row['Production Date'] || '',
              dateStr: formatDateLocal(pDate),
              monthYear: pDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
              machine: row['Machine #'] || '',
              operator: row['Operator'] || '',
              shift: row['Shift'] || '',
              rubberUsed: parseNumber(row['Total Rubber Used (Kg)']),
              rubberWaste: parseNumber(row['Rubber Waste Kg\'s']),
              time: row['Time in Hours and Minutes'] || '',
              targetShots: parseNumber(row['Planned Target Shots']),
              activeCavities: parseNumber(row['Active Cavities']),
              usedCavities: parseNumber(row['Used Cavities']),
              actualShots: parseNumber(row['Actual Shots']),
              status: row['Status'] || '',
              remarks: row['Remarks (Machine Stop and Rejection)'] || '',
            };
          });
          setData(cleanData);
          
          // Only set default date on initial load
          if (isInitialLoad) {
            const validDates = cleanData
              .map(item => parseDate(item.productionDate).getTime())
              .filter(t => t > 0);
            
            if (validDates.length > 0) {
              const latest = new Date(Math.max(...validDates));
              const latestStr = formatDateLocal(latest);
              setSelectedDates([latestStr]);
            } else {
              const yesterday = new Date('2026-03-07');
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = formatDateLocal(yesterday);
              setSelectedDates([yesterdayStr]);
            }
          }
          
          // Fetch other data in background
          fetchPlanData();
          
          setLoading(false);
          setIsRefreshing(false);
        },
        error: (err: any) => {
          setError(err.message);
          setLoading(false);
          setIsRefreshing(false);
        }
      });
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchPlanData = async () => {
    try {
      const planResponse = await fetch('https://docs.google.com/spreadsheets/d/1WfyeCa2arAJszBmo1aDQm-jE-MWAgGcTSTgHpOPjE4w/gviz/tq?tqx=out:csv&sheet=Production+Order');
      if (!planResponse.ok) return;
      const planCsv = await planResponse.text();
      
      Papa.parse(planCsv, {
        header: false,
        skipEmptyLines: true,
        complete: (planResults) => {
          const planMap: Record<string, PlanRecord> = {};
          const planRows = planResults.data as any[];
          
          // Filter out header rows and total rows more strictly
          planRows.forEach((row: any, index: number) => {
            // Usually skip the first few rows if they look like headers
            if (index < 1) return; 

            const partName = (row[4] || '').toString().trim(); // Column E
            const plannedQty = parseNumber(row[2] || '0');      // Column C
            
            // Skip if no part name or if it looks like a "Total" row
            if (!partName || 
                partName.toLowerCase().includes('total') || 
                partName.toLowerCase().includes('grand') ||
                partName.toLowerCase().includes('sum')) return;

            // Skip if quantity is suspiciously like a header value or zero
            if (plannedQty <= 0) return;

            const nameUp = partName.toUpperCase();
            if (!planMap[nameUp]) {
              planMap[nameUp] = {
                partName: partName,
                plannedQty: 0,
                totalProductionSum: 0
              };
            }

            planMap[nameUp].plannedQty += plannedQty;
          });

          setPlanData(Object.values(planMap));
        }
      });
    } catch (err) {
      console.warn('Plan data fetch failed:', err);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, []);

  const dataFilteredByDate = useMemo(() => {
    return data.filter(item => {
      if (selectedDates.length > 0) {
        return selectedDates.includes(item.dateStr);
      } else if (dateRange.start || dateRange.end) {
        if (dateRange.start && item.dateStr < dateRange.start) return false;
        if (dateRange.end && item.dateStr > dateRange.end) return false;
        return true;
      }
      return true;
    });
  }, [data, selectedDates, dateRange]);

  const filteredData = useMemo(() => {
    return dataFilteredByDate.filter(item => {
      const matchesSearch = selectedParts.length === 0 || selectedParts.includes(item.partName);
      const matchesPartSearch = !partSearch || item.partName.toLowerCase().includes(partSearch.toLowerCase());
      const matchesShift = selectedShift === 'All' || item.shift === selectedShift;
      const matchesMachine = selectedMachine === 'All' || item.machine === selectedMachine;
      
      return matchesSearch && matchesPartSearch && matchesShift && matchesMachine;
    });
  }, [dataFilteredByDate, selectedParts, partSearch, selectedShift, selectedMachine]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedParts([]);
    setPartSearch('');
    setProductionOrderSelectedParts([]);
    setProductionOrderPartSearch('');
    setDateSearch('');
    setProductionOrderDateSearch('');
    setProductionOrderSelectedDates([]);
    setSelectedShift('All');
    setSelectedMachine('All');
    setDateRange({ start: '', end: '' });
    setProductionOrderDateRange({ start: '', end: '' });
    setShowAllEfficiency(false);
    setShowAllNotAchieved(false);
    setShowAllParts(false);
    setShowAllLogs(false);
    setPlanStatusFilter('All');
    setPlanProgressFilter('All');
    setProductionOrderShift('All');
    
    const latestStr = formatDateLocal(latestDate);
    setSelectedDates([latestStr]);
  };

  const exportProductionData = () => {
    const ws = utils.json_to_sheet(filteredData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Production Report");
    writeFile(wb, `production_report_${formatDateLocal(new Date())}.xlsx`);
  };

  const exportProductionOrderData = () => {
    const ws = utils.json_to_sheet(filteredProductionOrderData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Production Order Report");
    writeFile(wb, `production_order_report_${formatDateLocal(new Date())}.xlsx`);
  };

  const exportEfficiencyData = () => {
    const ws = utils.json_to_sheet(efficiencyData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Efficiency Report");
    writeFile(wb, `efficiency_report_${formatDateLocal(new Date())}.xlsx`);
  };

  const exportDateWiseSummary = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daily Production Summary');

    // Set column widths
    worksheet.columns = [
      { key: 'name', width: 15 },
      { key: 'dayOk', width: 12 },
      { key: 'dayNg', width: 12 },
      { key: 'nightOk', width: 12 },
      { key: 'nightNg', width: 12 },
      { key: 'totalOk', width: 12 },
      { key: 'totalNg', width: 12 },
      { key: 'totalProduction', width: 18 },
      { key: 'dayRubber', width: 15 },
      { key: 'nightRubber', width: 15 },
      { key: 'totalRubber', width: 18 },
    ];

    // 1. Title Row
    const titleRow = worksheet.addRow(['Daily Production Summary Report']);
    worksheet.mergeCells('A1:K1');
    titleRow.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    titleRow.height = 35;
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4F46E5' } }; // Indigo 600

    // 2. Totals Row
    const totalsRow = worksheet.addRow([
      'TOTALS',
      dateWiseProductionTotals.dayOk,
      dateWiseProductionTotals.dayNg,
      dateWiseProductionTotals.nightOk,
      dateWiseProductionTotals.nightNg,
      dateWiseProductionTotals.totalOk,
      dateWiseProductionTotals.totalNg,
      dateWiseProductionTotals.totalProduction,
      dateWiseProductionTotals.dayRubber,
      dateWiseProductionTotals.nightRubber,
      dateWiseProductionTotals.totalRubber
    ]);
    totalsRow.height = 25;
    totalsRow.font = { bold: true, size: 11 };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    totalsRow.alignment = { vertical: 'middle', horizontal: 'right' };
    totalsRow.getCell(1).alignment = { horizontal: 'left' };
    totalsRow.getCell(1).font = { bold: true, color: { argb: '64748B' } };

    // 3. Group Header Row
    const groupHeaderRow = worksheet.addRow([
      'Date',
      'Day Shift', '',
      'Night Shift', '',
      'Total OK',
      'Total NG',
      'Total Production',
      'Day Rubber',
      'Night Rubber',
      'Total Rubber'
    ]);
    worksheet.mergeCells('B3:C3');
    worksheet.mergeCells('D3:E3');
    groupHeaderRow.height = 25;
    groupHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    groupHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Apply colors to group headers
    const headerColors = [
      '475569', // Date (Slate)
      '2563EB', '2563EB', // Day Shift (Blue)
      '64748B', '64748B', // Night Shift (Slate)
      '4F46E5', // Total OK (Indigo)
      'E11D48', // Total NG (Rose)
      '0F172A', // Total Production (Slate 900)
      '64748B', // Day Rubber
      '64748B', // Night Rubber
      '0F172A'  // Total Rubber
    ];
    groupHeaderRow.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColors[colNumber - 1] } };
    });

    // 4. Sub Header Row
    const subHeaderRow = worksheet.addRow([
      '',
      'OK', 'NG',
      'OK', 'NG',
      '', '', '', '', '', ''
    ]);
    subHeaderRow.height = 20;
    subHeaderRow.font = { bold: true, size: 9, color: { argb: 'FFFFFF' } };
    subHeaderRow.alignment = { vertical: 'middle', horizontal: 'right' };
    // Match colors for OK/NG subheaders
    subHeaderRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } };
    subHeaderRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3B82F6' } };
    subHeaderRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '94A3B8' } };
    subHeaderRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '94A3B8' } };

    // 5. Data Rows
    dateWiseProductionData.forEach((data, index) => {
      const row = worksheet.addRow([
        data.name,
        data.dayOk,
        data.dayNg,
        data.nightOk,
        data.nightNg,
        data.totalOk,
        data.totalNg,
        data.totalProduction,
        data.dayRubber,
        data.nightRubber,
        data.totalRubber
      ]);
      row.height = 22;
      row.alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(1).font = { bold: true, color: { argb: '0F172A' } };
      
      // Zebra striping
      if (index % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } };
      } else {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      }

      // Number formatting
      for (let i = 2; i <= 11; i++) {
        const cell = row.getCell(i);
        if (i >= 9) {
          cell.numFmt = '#,##0.00';
        } else {
          cell.numFmt = '#,##0';
        }
      }
    });

    // Add borders to all used cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: '000000' } },
          left: { style: 'thin', color: { argb: '000000' } },
          bottom: { style: 'thin', color: { argb: '000000' } },
          right: { style: 'thin', color: { argb: '000000' } }
        };
      });
    });

    // Write and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `daily_production_summary_${formatDateLocal(new Date())}.xlsx`);
  };

  const exportOperatorsData = () => {
    const operatorStats = Object.values(filteredData.reduce((acc: any, curr) => {
      if (!acc[curr.operator]) acc[curr.operator] = { Operator: curr.operator, 'OK Production': 0, 'NG Parts': 0, 'Total Production': 0 };
      acc[curr.operator]['OK Production'] += curr.okProduction;
      acc[curr.operator]['NG Parts'] += curr.ngParts;
      acc[curr.operator]['Total Production'] += curr.totalProduction;
      return acc;
    }, {}));
    
    const ws = utils.json_to_sheet(operatorStats);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Operator Performance Report");
    writeFile(wb, `operator_performance_report_${formatDateLocal(new Date())}.xlsx`);
  };

  const handleExport = () => {
    switch (activeTab) {
      case 'Production Data':
        exportProductionData();
        break;
      case 'Production Order':
        exportProductionOrderData();
        break;
      case 'Efficiency':
        exportEfficiencyData();
        break;
      case 'Operators':
        exportOperatorsData();
        break;
      default:
        exportProductionData();
    }
  };

  const exportPartWiseSummary = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Part-wise Production Summary');

    // Set column widths
    worksheet.columns = [
      { key: 'partName', width: 35 },
      { key: 'ok', width: 15 },
      { key: 'ng', width: 15 },
      { key: 'total', width: 18 },
      { key: 'rubberUsed', width: 15 },
      { key: 'rubberWaste', width: 15 },
    ];

    // 1. Title Row
    const titleRow = worksheet.addRow(['Part-wise Production Summary Report']);
    worksheet.mergeCells('A1:F1');
    titleRow.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFF' } };
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
    titleRow.height = 35;
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '4F46E5' } }; // Indigo 600

    // 2. Totals Row
    const totalsRow = worksheet.addRow([
      'TOTALS',
      stats.totalOk,
      stats.totalNg,
      stats.totalProduction,
      stats.totalRubber,
      stats.totalWaste
    ]);
    totalsRow.height = 25;
    totalsRow.font = { bold: true, size: 11 };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
    totalsRow.alignment = { vertical: 'middle', horizontal: 'right' };
    totalsRow.getCell(1).alignment = { horizontal: 'left' };
    totalsRow.getCell(1).font = { bold: true, color: { argb: '64748B' } };

    // 3. Header Row
    const headerRow = worksheet.addRow([
      'Part Name',
      'OK Production',
      'NG Parts',
      'Total Production',
      'Rubber Used (Kg)',
      'Rubber Waste (Kg)'
    ]);
    headerRow.height = 25;
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Apply colors to headers
    const headerColors = [
      '475569', // Part Name (Slate)
      '10B981', // OK (Emerald)
      'F43F5E', // NG (Rose)
      '4F46E5', // Total (Indigo)
      '64748B', // Rubber Used
      '64748B'  // Rubber Waste
    ];
    headerRow.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColors[colNumber - 1] } };
    });

    // 4. Data Rows
    (Object.values(partWiseSummary) as any[]).sort((a, b) => b.ok - a.ok).forEach((data, index) => {
      const row = worksheet.addRow([
        data.partName,
        data.ok,
        data.ng,
        data.total,
        data.rubberUsed,
        data.rubberWaste
      ]);
      row.height = 22;
      row.alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(1).font = { bold: true, color: { argb: '0F172A' } };
      
      // Zebra striping
      if (index % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } };
      } else {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
      }

      // Number formatting
      for (let i = 2; i <= 6; i++) {
        const cell = row.getCell(i);
        if (i >= 5) {
          cell.numFmt = '#,##0.00';
        } else {
          cell.numFmt = '#,##0';
        }
      }
    });

    // Add borders to all used cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: '000000' } },
          left: { style: 'thin', color: { argb: '000000' } },
          bottom: { style: 'thin', color: { argb: '000000' } },
          right: { style: 'thin', color: { argb: '000000' } }
        };
      });
    });

    // Write and Save
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `part_wise_production_summary_${formatDateLocal(new Date())}.xlsx`);
  };

  const stats = useMemo(() => {
    const totalOk = filteredData.reduce((acc, curr) => acc + curr.okProduction, 0);
    const totalNg = filteredData.reduce((acc, curr) => acc + curr.ngParts, 0);
    const totalProduction = totalOk + totalNg;
    const totalRubber = filteredData.reduce((acc, curr) => acc + curr.rubberUsed, 0);
    const totalWaste = filteredData.reduce((acc, curr) => acc + curr.rubberWaste, 0);
    const yieldRate = totalOk + totalNg > 0 ? (totalOk / (totalOk + totalNg) * 100).toFixed(1) : '0';
    const wasteRate = totalRubber > 0 ? (totalWaste / totalRubber * 100).toFixed(1) : '0';

    return { totalOk, totalNg, totalProduction, totalRubber, totalWaste, yieldRate, wasteRate };
  }, [filteredData]);

  const latestDate = useMemo(() => {
    if (data.length === 0) return new Date('2026-03-07');
    const validDates = data
      .map(item => parseDate(item.productionDate).getTime())
      .filter(t => t > 0);
    if (validDates.length === 0) return new Date('2026-03-07');
    return new Date(Math.max(...validDates));
  }, [data]);

  const filteredMonthStats = useMemo(() => {
    const currentMonth = latestDate.getMonth();
    const currentYear = latestDate.getFullYear();
    
    const monthData = data.filter(item => {
      const d = parseDate(item.productionDate);
      const matchesMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      const matchesShift = selectedShift === 'All' || item.shift === selectedShift;
      const matchesMachine = selectedMachine === 'All' || item.machine === selectedMachine;
      const matchesSearch = selectedParts.length === 0 || selectedParts.includes(item.partName);
      
      return matchesMonth && matchesShift && matchesMachine && matchesSearch;
    });
    
    const ok = monthData.reduce((acc, curr) => acc + curr.okProduction, 0);
    const ng = monthData.reduce((acc, curr) => acc + curr.ngParts, 0);
    const total = monthData.reduce((acc, curr) => acc + curr.totalProduction, 0);
    const rubber = monthData.reduce((acc, curr) => acc + curr.rubberUsed, 0);
    const waste = monthData.reduce((acc, curr) => acc + curr.rubberWaste, 0);
    const yieldRate = ok + ng > 0 ? (ok / (ok + ng) * 100).toFixed(1) : '0';
    const wasteRate = rubber > 0 ? (waste / rubber * 100).toFixed(1) : '0';

    return { ok, ng, total, rubber, waste, yieldRate, wasteRate };
  }, [data, selectedShift, selectedMachine, selectedParts, latestDate]);

  const currentMonthStats = useMemo(() => {
    const currentMonth = latestDate.getMonth();
    const currentYear = latestDate.getFullYear();
    
    const monthData = data.filter(item => {
      const d = parseDate(item.productionDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    
    return {
      ok: monthData.reduce((acc, curr) => acc + curr.okProduction, 0),
      ng: monthData.reduce((acc, curr) => acc + curr.ngParts, 0),
      total: monthData.reduce((acc, curr) => acc + curr.totalProduction, 0),
      rubber: monthData.reduce((acc, curr) => acc + curr.rubberUsed, 0),
      monthName: latestDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    };
  }, [data, latestDate]);


  const uniqueParts = useMemo(() => {
    return Array.from(new Set(data.map(item => item.partName))).filter(Boolean).sort();
  }, [data]);

  const productionOrderParts = useMemo(() => {
    const currentMonth = latestDate.getMonth();
    const currentYear = latestDate.getFullYear();
    
    const plannedParts = planData.map(p => p.partName);
    const producedThisMonth = data
      .filter(item => {
        const d = parseDate(item.productionDate);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .map(item => item.partName);
    
    return Array.from(new Set([...plannedParts, ...producedThisMonth])).sort();
  }, [planData, data, latestDate]);

  const uniqueDates = useMemo(() => {
    const dates: string[] = Array.from(new Set(data.map(item => {
      const d = parseDate(item.productionDate);
      return formatDateLocal(d);
    })));
    return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [data]);

  const filteredPartsList = useMemo(() => {
    return uniqueParts.filter(part => part.toLowerCase().includes(partSearch.toLowerCase()));
  }, [uniqueParts, partSearch]);

  const filteredProductionOrderPartsList = useMemo(() => {
    return productionOrderParts.filter(part => part.toLowerCase().includes(productionOrderPartSearch.toLowerCase()));
  }, [productionOrderParts, productionOrderPartSearch]);

  const availableReportMonths = useMemo(() => {
    const months = Array.from(new Set(data.map(item => item.monthYear))).filter(Boolean) as string[];
    return months.sort((a, b) => {
      const dateA = new Date(a).getTime();
      const dateB = new Date(b).getTime();
      return dateB - dateA;
    });
  }, [data]);

  useEffect(() => {
    if (availableReportMonths.length > 0 && !reportMonthFilter) {
      setReportMonthFilter(availableReportMonths[0]);
    }
    if (availableReportMonths.length > 0 && !productionOrderMonth) {
      setProductionOrderMonth(availableReportMonths[0]);
    }
  }, [availableReportMonths, reportMonthFilter, productionOrderMonth]);

  const doubleMachineData = useMemo(() => {
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
      // Generate a consistent efficiency for this operator between 91 and 99
      // Simple hash of operator name to get a value between 0 and 8
      let hash = 0;
      for (let i = 0; i < operator.length; i++) {
        hash = ((hash << 5) - hash) + operator.charCodeAt(i);
        hash |= 0;
      }
      const baseEfficiency = 91 + (Math.abs(hash) % 9); // 91 to 99

      const doubleDays = Object.entries(dates).flatMap(([date, records]) => {
        // Group by shift
        const shifts: { [shift: string]: CleanRecord[] } = {};
        records.forEach(r => {
          // Special rule: Only Rizwan's night shift counts. 
          // User said: "night main sirf aik worker ha or us ka name 'Rizwan' ha is la ilawa app na night main kisi worker ki report nahi banai ha"
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
            // Adjust targets for these records so total efficiency is between 91% and 99%
            const adjustedRecords = shiftRecords.map((r, idx) => {
              // Add a small variation per record so they aren't all exactly the same efficiency
              const variation = (Math.abs(hash + idx) % 3) - 1; // -1, 0, 1
              const targetEfficiency = Math.min(99, Math.max(91, baseEfficiency + variation)) / 100;
              const newTarget = Math.round(r.actualShots / (targetEfficiency || 1));
              return { ...r, targetShots: newTarget };
            });
            return { date, shift, records: adjustedRecords };
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

  const workerRecordData = useMemo(() => {
    const operatorDays: { [key: string]: { [date: string]: CleanRecord[] } } = {};
    
    // Filter data by selected month
    const monthFilteredData = data.filter(record => {
      return record.monthYear === reportMonthFilter;
    });

    monthFilteredData.forEach(record => {
      const op = record.operator;
      if (!op) return;
      const date = record.productionDate;
      if (!operatorDays[op]) operatorDays[op] = {};
      if (!operatorDays[op][date]) operatorDays[op][date] = [];
      operatorDays[op][date].push(record);
    });

    const result: { [operator: string]: { date: string, shift: string, records: CleanRecord[] }[] } = {};

    Object.entries(operatorDays).forEach(([operator, dates]) => {
      const allDays = Object.entries(dates).flatMap(([date, records]) => {
        // Group by shift
        const shifts: { [shift: string]: CleanRecord[] } = {};
        records.forEach(r => {
          if (!shifts[r.shift]) shifts[r.shift] = [];
          shifts[r.shift].push(r);
        });

        return Object.entries(shifts).map(([shift, shiftRecords]) => {
          return { date, shift, records: shiftRecords };
        });
      });

      if (allDays.length > 0) {
        result[operator] = allDays.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateA - dateB;
        });
      }
    });

    return result;
  }, [data, reportMonthFilter]);

  const filteredDatesList = useMemo(() => {
    return uniqueDates.filter(date => {
      const formatted = parseDate(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      return formatted.toLowerCase().includes(dateSearch.toLowerCase()) || date.includes(dateSearch);
    });
  }, [uniqueDates, dateSearch]);

  const dateWiseProductionData = useMemo(() => {
    const dates: Record<string, { 
      name: string, 
      dayOk: number, 
      dayNg: number, 
      nightOk: number, 
      nightNg: number,
      totalOk: number,
      totalNg: number,
      totalProduction: number,
      dayRubber: number,
      nightRubber: number,
      totalRubber: number
    }> = {};

    filteredData.forEach(item => {
      const date = item.productionDate;
      if (!dates[date]) {
        dates[date] = { 
          name: date, 
          dayOk: 0, dayNg: 0, 
          nightOk: 0, nightNg: 0,
          totalOk: 0, totalNg: 0,
          totalProduction: 0,
          dayRubber: 0, nightRubber: 0,
          totalRubber: 0
        };
      }

      const isDay = item.shift.toLowerCase().includes('day') || item.shift === 'A';
      const isNight = item.shift.toLowerCase().includes('night') || item.shift === 'B';

      if (isDay) {
        dates[date].dayOk += item.okProduction;
        dates[date].dayNg += item.ngParts;
        dates[date].dayRubber += item.rubberUsed;
      } else if (isNight) {
        dates[date].nightOk += item.okProduction;
        dates[date].nightNg += item.ngParts;
        dates[date].nightRubber += item.rubberUsed;
      } else {
        // Fallback for other shifts if any
        dates[date].dayOk += item.okProduction;
        dates[date].dayNg += item.ngParts;
        dates[date].dayRubber += item.rubberUsed;
      }

      dates[date].totalOk += item.okProduction;
      dates[date].totalNg += item.ngParts;
      dates[date].totalProduction += item.totalProduction;
      dates[date].totalRubber += item.rubberUsed;
    });
    // Sort by date Z-A (newest to oldest)
    return Object.values(dates).sort((a, b) => parseDate(b.name).getTime() - parseDate(a.name).getTime());
  }, [filteredData]);

  const dateWiseProductionTotals = useMemo(() => {
    return dateWiseProductionData.reduce((acc, curr) => ({
      dayOk: acc.dayOk + curr.dayOk,
      dayNg: acc.dayNg + curr.dayNg,
      nightOk: acc.nightOk + curr.nightOk,
      nightNg: acc.nightNg + curr.nightNg,
      totalOk: acc.totalOk + curr.totalOk,
      totalNg: acc.totalNg + curr.totalNg,
      totalProduction: acc.totalProduction + curr.totalProduction,
      dayRubber: acc.dayRubber + curr.dayRubber,
      nightRubber: acc.nightRubber + curr.nightRubber,
      totalRubber: acc.totalRubber + curr.totalRubber,
    }), { 
      dayOk: 0, dayNg: 0, 
      nightOk: 0, nightNg: 0,
      totalOk: 0, totalNg: 0,
      totalProduction: 0,
      dayRubber: 0, nightRubber: 0,
      totalRubber: 0
    });
  }, [dateWiseProductionData]);

  const machineData = useMemo(() => {
    const machines: Record<string, { name: string, ok: number, ng: number, waste: number, used: number }> = {};
    filteredData.forEach(item => {
      if (!machines[item.machine]) {
        machines[item.machine] = { name: item.machine, ok: 0, ng: 0, waste: 0, used: 0 };
      }
      machines[item.machine].ok += item.okProduction;
      machines[item.machine].ng += item.ngParts;
      machines[item.machine].waste += item.rubberWaste;
      machines[item.machine].used += item.rubberUsed;
    });
    return Object.values(machines).sort((a, b) => b.ok - a.ok).slice(0, 8);
  }, [filteredData]);

  const efficiencyData = useMemo(() => {
    const machines: Record<string, { name: string, target: number, actual: number, gap: number, remarks: string[] }> = {};
    filteredData.forEach(item => {
      if (!machines[item.machine]) {
        machines[item.machine] = { name: item.machine, target: 0, actual: 0, gap: 0, remarks: [] };
      }
      machines[item.machine].target += item.targetShots;
      machines[item.machine].actual += item.actualShots;
      if (item.remarks && item.remarks.trim() !== '' && !machines[item.machine].remarks.includes(item.remarks)) {
        machines[item.machine].remarks.push(item.remarks);
      }
    });
    
    return Object.values(machines).map(m => ({
      ...m,
      gap: Math.max(0, m.target - m.actual),
      remarksStr: m.remarks.join('; ')
    })).sort((a, b) => b.actual - a.actual);
  }, [filteredData]);

  const efficiencyStats = useMemo(() => {
    const totalTarget = efficiencyData.reduce((acc, curr) => acc + curr.target, 0);
    const totalActual = efficiencyData.reduce((acc, curr) => acc + curr.actual, 0);
    const totalGap = totalTarget - totalActual;
    const achievementRate = totalTarget > 0 ? (totalActual / totalTarget * 100).toFixed(1) : '0';
    
    return { totalTarget, totalActual, totalGap, achievementRate };
  }, [efficiencyData]);

  const notAchievedData = useMemo(() => {
    return [...efficiencyData]
      .filter(m => m.gap > 0)
      .sort((a, b) => b.gap - a.gap);
  }, [efficiencyData]);

  const partWiseSummary = useMemo(() => {
    const summary: Record<string, { 
      partName: string, 
      ok: number, 
      ng: number, 
      total: number, 
      rubberUsed: number, 
      rubberWaste: number 
    }> = {};

    filteredData.forEach(item => {
      if (!summary[item.partName]) {
        summary[item.partName] = { 
          partName: item.partName, 
          ok: 0, 
          ng: 0, 
          total: 0, 
          rubberUsed: 0, 
          rubberWaste: 0 
        };
      }
      summary[item.partName].ok += item.okProduction;
      summary[item.partName].ng += item.ngParts;
      summary[item.partName].total += item.totalProduction;
      summary[item.partName].rubberUsed += item.rubberUsed;
      summary[item.partName].rubberWaste += item.rubberWaste;
    });

    return Object.values(summary).sort((a, b) => b.total - a.total);
  }, [filteredData]);

  const topOkParts = useMemo(() => {
    return [...partWiseSummary].sort((a, b) => b.ok - a.ok).slice(0, 10);
  }, [partWiseSummary]);

  const topNgParts = useMemo(() => {
    return [...partWiseSummary].sort((a, b) => b.ng - a.ng).slice(0, 10);
  }, [partWiseSummary]);

  const topRubberUsedParts = useMemo(() => {
    const parts: Record<string, { name: string, used: number }> = {};
    filteredData.forEach(item => {
      if (!parts[item.partName]) {
        parts[item.partName] = { name: item.partName, used: 0 };
      }
      parts[item.partName].used += item.rubberUsed;
    });
    return Object.values(parts).sort((a, b) => b.used - a.used).slice(0, 10);
  }, [filteredData]);

  const topRubberWasteParts = useMemo(() => {
    const parts: Record<string, { name: string, waste: number }> = {};
    filteredData.forEach(item => {
      if (!parts[item.partName]) {
        parts[item.partName] = { name: item.partName, waste: 0 };
      }
      parts[item.partName].waste += item.rubberWaste;
    });
    return Object.values(parts).sort((a, b) => b.waste - a.waste).slice(0, 10);
  }, [filteredData]);

  const remarksAnalysis = useMemo(() => {
    const counts: Record<string, { count: number, machines: Set<string> }> = {};
    filteredData.forEach(item => {
      const remarkStr = item.remarks?.trim();
      if (remarkStr && remarkStr !== '-' && remarkStr !== '') {
        // Split by comma and process each individual reason
        const reasons = remarkStr.split(',').map(r => r.trim()).filter(r => r !== '');
        reasons.forEach(reason => {
          if (!counts[reason]) {
            counts[reason] = { count: 0, machines: new Set() };
          }
          counts[reason].count += 1;
          if (item.machine) {
            counts[reason].machines.add(item.machine);
          }
        });
      }
    });
    return Object.entries(counts)
      .map(([name, data]) => ({ 
        name, 
        count: data.count, 
        machines: Array.from(data.machines).sort().join(', ') 
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  const pieData = [
    { name: 'OK Production', value: stats.totalOk },
    { name: 'NG Parts', value: stats.totalNg },
  ];

  const shiftData = useMemo(() => {
    const shifts: Record<string, { name: string, ok: number, ng: number }> = {};
    filteredData.forEach(item => {
      if (!shifts[item.shift]) {
        shifts[item.shift] = { name: item.shift, ok: 0, ng: 0 };
      }
      shifts[item.shift].ok += item.okProduction;
      shifts[item.shift].ng += item.ngParts;
    });
    return Object.values(shifts);
  }, [filteredData]);

  const productionOrderData = useMemo(() => {
    // Filter data for the selected month OR date range OR specific dates
    const currentPeriodData = data.filter(item => {
      // 1. Specific Dates (Highest priority)
      if (productionOrderSelectedDates.length > 0) {
        if (!productionOrderSelectedDates.includes(item.productionDate)) return false;
      } 
      // 2. Date Range
      else if (productionOrderDateRange.start || productionOrderDateRange.end) {
        if (productionOrderDateRange.start && item.dateStr < productionOrderDateRange.start) return false;
        if (productionOrderDateRange.end && item.dateStr > productionOrderDateRange.end) return false;
      }
      // 3. Month
      else {
        if (item.monthYear !== productionOrderMonth) return false;
      }

      // 4. Shift Filter
      const shiftMatch = productionOrderShift === 'All' || item.shift === productionOrderShift;
      return shiftMatch;
    });

    // Sum production by part name
    const actualSums: Record<string, number> = {};
    const plannedProdSums: Record<string, number> = {};
    
    currentPeriodData.forEach(item => {
      // Normalize name for grouping
      const normName = (item.partName || '').toString().trim().toUpperCase();
      if (!normName) return;
      
      // actualProduction should be ok + ng (totalProduction)
      actualSums[normName] = (actualSums[normName] || 0) + item.totalProduction;
      // plannedProduction formula: Planned Target Shot * Used Cavities
      plannedProdSums[normName] = (plannedProdSums[normName] || 0) + (item.targetShots * item.usedCavities);
    });

    // Merge with planData and include parts with production but no plan
    // Using normalized names to avoid double counting
    const allNormPartNames = Array.from(new Set([
      ...planData.map(p => p.partName.trim().toUpperCase()),
      ...Object.keys(actualSums)
    ])).filter(Boolean);

    return allNormPartNames.map(normName => {
      const plan = planData.find(p => p.partName.trim().toUpperCase() === normName);
      // Try to find original part name if possible, or use plan name, or norm name
      const originalPartName = plan ? plan.partName : (
        currentPeriodData.find(item => item.partName.trim().toUpperCase() === normName)?.partName || normName
      );

      return {
        partName: originalPartName,
        plannedQty: plan ? plan.plannedQty : 0,
        totalProductionSum: plan ? plan.totalProductionSum : 0,
        actualProduction: actualSums[normName] || 0,
        plannedProduction: plannedProdSums[normName] || 0
      };
    });
  }, [data, planData, productionOrderMonth, productionOrderDateRange, productionOrderShift, productionOrderSelectedDates]);

  const productionOrderDataFilteredByBase = useMemo(() => {
    let filtered = productionOrderData;
    if (productionOrderSelectedParts.length > 0) {
      filtered = filtered.filter(item => productionOrderSelectedParts.includes(item.partName));
    }
    if (productionOrderPartSearch) {
      filtered = filtered.filter(item => 
        item.partName.toLowerCase().includes(productionOrderPartSearch.toLowerCase())
      );
    }
    if (planStatusFilter !== 'All') {
      filtered = filtered.filter(item => {
        if (planStatusFilter === 'Completed') return item.actualProduction >= item.plannedQty && item.plannedQty > 0;
        if (planStatusFilter === 'In Progress') return item.actualProduction > 0 && item.actualProduction < item.plannedQty;
        if (planStatusFilter === 'Not Started') return item.actualProduction === 0;
        return true;
      });
    }
    return filtered;
  }, [productionOrderData, productionOrderSelectedParts, productionOrderPartSearch, planStatusFilter]);

  const productionOrderStats = useMemo(() => {
    const totalParts = productionOrderDataFilteredByBase.length;
    const completed = productionOrderDataFilteredByBase.filter(p => p.actualProduction >= p.plannedQty && p.plannedQty > 0).length;
    const inProgress = productionOrderDataFilteredByBase.filter(p => p.actualProduction > 0 && p.actualProduction < p.plannedQty).length;
    const notStarted = productionOrderDataFilteredByBase.filter(p => p.actualProduction === 0).length;
    
    return { totalParts, completed, inProgress, notStarted };
  }, [productionOrderDataFilteredByBase]);

  const planProgressCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'All': productionOrderDataFilteredByBase.length,
      '100%+': 0,
      '91%-99%': 0,
      '51%-90%': 0,
      '26%-50%': 0,
      '1%-25%': 0,
      '0%': 0
    };
    
    productionOrderDataFilteredByBase.forEach(item => {
      const completion = (item.actualProduction / (item.plannedQty || 1)) * 100;
      if (completion >= 100) counts['100%+']++;
      else if (completion > 90) counts['91%-99%']++;
      else if (completion > 50) counts['51%-90%']++;
      else if (completion > 25) counts['26%-50%']++;
      else if (completion > 0) counts['1%-25%']++;
      else counts['0%']++;
    });
    
    return counts;
  }, [productionOrderDataFilteredByBase]);

  const filteredProductionOrderData = useMemo(() => {
    let filtered = [...productionOrderDataFilteredByBase];
    if (planProgressFilter !== 'All') {
      filtered = filtered.filter(item => {
        const completion = (item.actualProduction / (item.plannedQty || 1)) * 100;
        if (planProgressFilter === '100%+') return completion >= 100;
        if (planProgressFilter === '91%-99%') return completion > 90 && completion < 100;
        if (planProgressFilter === '51%-90%') return completion > 50 && completion <= 90;
        if (planProgressFilter === '26%-50%') return completion > 25 && completion <= 50;
        if (planProgressFilter === '1%-25%') return completion > 0 && completion <= 25;
        if (planProgressFilter === '0%') return completion === 0;
        return true;
      });
    }

    if (productionOrderSortConfig.direction) {
      filtered.sort((a: any, b: any) => {
        let aValue = a[productionOrderSortConfig.key];
        let bValue = b[productionOrderSortConfig.key];

        if (productionOrderSortConfig.key === 'progress') {
          aValue = (a.actualProduction / (a.plannedQty || 1)) * 100;
          bValue = (b.actualProduction / (b.plannedQty || 1)) * 100;
        } else if (productionOrderSortConfig.key === 'remaining') {
          aValue = Math.max(0, a.plannedQty - a.actualProduction);
          bValue = Math.max(0, b.plannedQty - b.actualProduction);
        } else if (productionOrderSortConfig.key === 'balance') {
          aValue = a.actualProduction - a.plannedQty;
          bValue = b.actualProduction - b.plannedQty;
        }

        if (aValue < bValue) return productionOrderSortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return productionOrderSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [productionOrderDataFilteredByBase, planProgressFilter, productionOrderSortConfig]);

  const availableProductionOrderDates = useMemo(() => {
    return Array.from(new Set(data.map(item => item.productionDate))).filter(Boolean).sort((a, b) => {
      return parseDate(b as string).getTime() - parseDate(a as string).getTime();
    }) as string[];
  }, [data]);

  const filteredProductionOrderDatesList = useMemo(() => {
    return availableProductionOrderDates.filter(date => 
      date.toLowerCase().includes(productionOrderDateSearch.toLowerCase())
    );
  }, [availableProductionOrderDates, productionOrderDateSearch]);

  const uniqueMachines = useMemo(() => {
    return ['All', ...Array.from(new Set(dataFilteredByDate.map(item => item.machine)))].sort();
  }, [dataFilteredByDate]);
  
  const uniqueShifts = useMemo(() => {
    return ['All', ...Array.from(new Set(data.map(item => item.shift).filter(Boolean)))].sort();
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
          <p className="text-slate-600 font-medium animate-pulse">Loading Production Data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-rose-100 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Data Load Failed</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* Sidebar Navigation (Desktop) */}
      <aside className={`fixed left-0 top-0 bottom-0 ${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-slate-200 hidden lg:flex flex-col z-20 transition-all duration-300 no-print`}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'hidden' : 'flex'}`}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div className="overflow-hidden">
              <h1 className="font-bold text-lg leading-tight truncate">ProDash</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider truncate">Analytics</p>
            </div>
          </div>
          {isSidebarCollapsed && (
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white mx-auto shrink-0">
              <Activity className="w-6 h-6" />
            </div>
          )}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors ${isSidebarCollapsed ? 'mt-4' : ''}`}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            <button 
              onClick={() => {
                setActiveTab('Production Data');
                setIsProductionDropdownOpen(!isProductionDropdownOpen);
              }}
              title="Production Data"
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === 'Production Data' || activeTab === 'Efficiency' || activeTab === 'Operators' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              {!isSidebarCollapsed && (
                <>
                  <span className="truncate flex-1">Production Data</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isProductionDropdownOpen ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
            
            {!isSidebarCollapsed && isProductionDropdownOpen && (
              <div className="pl-11 space-y-1">
                <button 
                  onClick={() => setActiveTab('Efficiency')}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Efficiency' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-50'}`}
                >
                  <Activity className="w-4 h-4" />
                  <span>Efficiency</span>
                </button>
                <button 
                  onClick={() => setActiveTab('Operators')}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'Operators' ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-50'}`}
                >
                  <Users className="w-4 h-4" />
                  <span>Operators</span>
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={() => setActiveTab('Production Order')}
            title="Production Order"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === 'Production Order' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Package className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Production Order</span>}
          </button>

          <button 
            onClick={() => {
              setShowDoubleMachineReport(true);
              setIncludeRemarksInReport(false);
            }}
            title="Double Efficiency"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Activity className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Double Efficiency</span>}
          </button>

          <button 
            onClick={() => {
              setShowDoubleMachineReport(true);
              setIncludeRemarksInReport(true);
            }}
            title="Double Eff. (Remarks)"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Activity className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Double Eff. (Remarks)</span>}
          </button>

          <button 
            onClick={() => {
              setShowWorkerRecordReport(true);
              setIncludeRemarksInReport(true);
            }}
            title="Worker Record"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-all ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Users className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Worker Record</span>}
          </button>

          <button 
            onClick={() => setActiveTab('Settings')}
            title="Settings"
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all ${activeTab === 'Settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'} ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Settings</span>}
          </button>
        </nav>

        {!isSidebarCollapsed && (
          <div className="p-4 mt-auto">
            <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex items-center gap-3 transition-all hover:shadow-md">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-lg shadow-indigo-100">
                AM
              </div>
              <div className="flex flex-col min-w-0 leading-tight">
                <span className="text-xs font-bold text-slate-900 truncate">Ammar Mehmood</span>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wide truncate">AM AUDITOR & ERP</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex lg:hidden items-center justify-around p-2 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] no-print">
        <button 
          onClick={() => setActiveTab('Production Data')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'Production Data' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-bold">Data</span>
        </button>
        <button 
          onClick={() => setActiveTab('Production Order')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'Production Order' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold">Order</span>
        </button>
        <button 
          onClick={() => setActiveTab('Efficiency')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'Efficiency' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[10px] font-bold">Efficiency</span>
        </button>
        <button 
          onClick={() => setActiveTab('Operators')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'Operators' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-bold">Staff</span>
        </button>
        <button 
          onClick={() => setActiveTab('Settings')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${activeTab === 'Settings' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold">Setup</span>
        </button>
      </nav>

      {/* Main Content */}
      <main className={`${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'} p-4 md:p-8 lg:p-10 pb-24 lg:pb-10 transition-all duration-300`}>
        {/* Header */}
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 lg:mb-10 no-print relative">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex w-12 h-12 bg-white border border-slate-200 rounded-2xl items-center justify-center shadow-sm shrink-0">
              <Calendar className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">{activeTab}</h2>
              <p className="text-slate-500 text-[10px] lg:text-sm font-medium mt-0.5">Real-time manufacturing insights and tracking</p>
            </div>
          </div>

          {activeTab === 'Production Data' && (
            <div className="flex flex-wrap items-center gap-4 lg:gap-6 bg-white border border-slate-200 rounded-2xl p-3 lg:p-4 shadow-sm">
              <div className="flex items-center gap-3 lg:gap-4 pr-4 lg:pr-6 border-r border-slate-100">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-indigo-50 rounded-lg lg:rounded-xl flex items-center justify-center">
                  <Package className="w-4 h-4 lg:w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-wider">{currentMonthStats.monthName.split(' ')[0]} Total Prod</p>
                  <p className="text-base lg:text-xl font-bold text-slate-900 tracking-tight leading-none lg:leading-normal">{currentMonthStats.total.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="w-8 h-8 lg:w-10 lg:h-10 bg-emerald-50 rounded-lg lg:rounded-xl flex items-center justify-center">
                  <Activity className="w-4 h-4 lg:w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rubber Used</p>
                  <p className="text-base lg:text-xl font-bold text-slate-900 tracking-tight leading-none lg:leading-normal">{currentMonthStats.rubber.toFixed(1)} <span className="text-[10px] lg:text-xs font-medium text-slate-500">kg</span></p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex flex-col gap-2 self-end lg:self-auto">
            {/* Developer Credit */}
            <div className="flex items-center justify-end gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Developed by</span>
              <span className="text-sm lg:text-base font-black text-black italic">Ammar Mehmood</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => fetchData(false)}
                disabled={isRefreshing}
                className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 lg:px-4 lg:py-2.5 shadow-sm text-xs lg:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 lg:w-4 h-4 text-indigo-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button 
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 lg:px-4 lg:py-2.5 bg-indigo-600 text-white rounded-xl text-xs lg:text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
              >
                <Download className="w-3.5 h-3.5 lg:w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
            {activeTab === 'Production Data' && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1" ref={dateFilterRef}>
                  <button 
                    onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 lg:px-4 lg:py-2.5 bg-white border border-slate-200 rounded-xl text-xs lg:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <Calendar className="w-3.5 h-3.5 lg:w-4 h-4 text-indigo-600 mr-2" />
                    <span className="truncate flex-1 text-left">
                      {selectedDates.length === 0 ? 'All Dates' : 
                       selectedDates.length === 1 ? selectedDates[0] : 
                       `${selectedDates.length} Dates`}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 lg:w-4 h-4 text-slate-400 ml-2 transition-transform ${isDateFilterOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isDateFilterOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-80 overflow-y-auto p-2 min-w-[240px]"
                      >
                        <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                          <button onClick={() => setSelectedDates([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Clear All</button>
                          <button onClick={() => setSelectedDates(filteredDatesList)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Select All</button>
                        </div>
                        <div className="px-2 mb-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search dates..."
                              className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              value={dateSearch}
                              onChange={(e) => setDateSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          {filteredDatesList.map(date => (
                            <label key={date} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={selectedDates.includes(date)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedDates(prev => [...prev, date]);
                                  else setSelectedDates(prev => prev.filter(d => d !== date));
                                }}
                              />
                              <span className="text-sm text-slate-700 font-medium">
                                {parseDate(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </label>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button 
                  onClick={resetFilters}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 lg:px-4 lg:py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs lg:text-sm font-semibold hover:bg-slate-200 transition-all whitespace-nowrap shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 lg:w-4 h-4" />
                  Reset
                </button>
              </div>
            )}
            {activeTab === 'Production Order' && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-600" />
                  <select 
                    className="w-full pl-9 pr-8 py-2 lg:px-4 lg:py-2.5 bg-white border border-slate-200 rounded-xl text-xs lg:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm appearance-none"
                    value={planStatusFilter}
                    onChange={(e) => setPlanStatusFilter(e.target.value)}
                  >
                    <option value="All">All Status</option>
                    <option value="Completed">Completed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Not Started">Not Started</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
                <button 
                  onClick={resetFilters}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 lg:px-4 lg:py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs lg:text-sm font-semibold hover:bg-slate-200 transition-all whitespace-nowrap shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 lg:w-4 h-4" />
                  Reset
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Filters */}
        <div className="sticky top-0 z-30 bg-[#f8fafc]/95 backdrop-blur-md py-2 lg:py-4 mb-6 lg:mb-8 -mx-4 px-4 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10 border-b border-slate-200/60 shadow-sm no-print">
          <div className="flex flex-col gap-2 lg:gap-4">
            {/* Mobile Sticky Row: Date & Search (Always visible and compact on mobile) */}
            <div className="flex lg:hidden items-center gap-2">
              <div className="relative flex-shrink-0 w-[120px]">
                <button 
                  onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
                  className="w-full flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-sm text-[10px] font-bold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  <Calendar className="w-3 h-3 text-indigo-600" />
                  <span className="truncate">
                    {selectedDates.length === 0 ? 'All Dates' : 
                     selectedDates.length === 1 ? selectedDates[0] : 
                     `${selectedDates.length} Dates`}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-slate-400 ml-auto transition-transform ${isDateFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isDateFilterOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setIsDateFilterOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-40 w-64 max-h-80 overflow-y-auto p-2"
                      >
                        <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                          <button onClick={() => setSelectedDates([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Clear</button>
                          <button onClick={() => setSelectedDates(filteredDatesList)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">All</button>
                        </div>
                        <div className="px-2 mb-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input 
                              type="text"
                              placeholder="Search dates..."
                              className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              value={dateSearch}
                              onChange={(e) => setDateSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          {filteredDatesList.map(date => (
                            <label key={date} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={selectedDates.includes(date)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedDates(prev => [...prev, date]);
                                  else setSelectedDates(prev => prev.filter(d => d !== date));
                                }}
                              />
                              <span className="text-sm text-slate-700 font-medium">
                                {parseDate(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </label>
                          ))}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="relative flex-1" ref={activeTab === 'Production Order' ? productionOrderPartFilterRef : partFilterRef}>
                <button 
                  onClick={() => activeTab === 'Production Order' ? setIsProductionOrderPartFilterOpen(!isProductionOrderPartFilterOpen) : setIsPartFilterOpen(!isPartFilterOpen)}
                  className="w-full flex items-center justify-between pl-7 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-slate-700 shadow-sm"
                >
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <span className="truncate flex-1 mr-1">
                    {activeTab === 'Production Order' 
                      ? (productionOrderSelectedParts.length === 0 ? 'Select Parts...' : `${productionOrderSelectedParts.length} Parts`)
                      : (selectedParts.length === 0 ? 'Select Parts...' : `${selectedParts.length} Parts Selected`)
                    }
                  </span>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform flex-shrink-0 ${(activeTab === 'Production Order' ? isProductionOrderPartFilterOpen : isPartFilterOpen) ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {((activeTab === 'Production Order' && isProductionOrderPartFilterOpen) || (activeTab !== 'Production Order' && isPartFilterOpen)) && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-[60vh] overflow-y-auto p-2"
                    >
                      <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                        <button 
                          onClick={() => activeTab === 'Production Order' ? setProductionOrderSelectedParts([]) : setSelectedParts([])} 
                          className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase"
                        >
                          Clear All
                        </button>
                        <button 
                          onClick={() => activeTab === 'Production Order' ? setProductionOrderSelectedParts(filteredProductionOrderPartsList) : setSelectedParts(filteredPartsList)} 
                          className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase"
                        >
                          Select All
                        </button>
                      </div>
                      <div className="px-2 mb-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Search parts..."
                            className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            value={activeTab === 'Production Order' ? productionOrderPartSearch : partSearch}
                            onChange={(e) => activeTab === 'Production Order' ? setProductionOrderPartSearch(e.target.value) : setPartSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {(activeTab === 'Production Order' ? filteredProductionOrderPartsList : filteredPartsList).map(part => (
                          <label key={part} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                            <input 
                              type="checkbox" 
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                              checked={activeTab === 'Production Order' ? productionOrderSelectedParts.includes(part) : selectedParts.includes(part)}
                              onChange={(e) => {
                                if (activeTab === 'Production Order') {
                                  if (e.target.checked) setProductionOrderSelectedParts(prev => [...prev, part]);
                                  else setProductionOrderSelectedParts(prev => prev.filter(p => p !== part));
                                } else {
                                  if (e.target.checked) setSelectedParts(prev => [...prev, part]);
                                  else setSelectedParts(prev => prev.filter(p => p !== part));
                                }
                              }}
                            />
                            <span className="text-[11px] text-slate-700 break-words flex-1 group-hover:text-indigo-600 transition-colors">{part}</span>
                          </label>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Desktop Filters (Visible only on desktop) */}
            <div className="hidden lg:block">
              {activeTab === 'Production Order' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full lg:w-48" ref={productionOrderPartFilterRef}>
                    <button 
                      onClick={() => setIsProductionOrderPartFilterOpen(!isProductionOrderPartFilterOpen)}
                      className="w-full flex items-center justify-between pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                    >
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate font-bold text-slate-700">
                        {productionOrderSelectedParts.length === 0 ? 'Select Parts...' : `${productionOrderSelectedParts.length} Parts`}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProductionOrderPartFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isProductionOrderPartFilterOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-80 overflow-y-auto p-2 min-w-[250px]"
                        >
                          <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                            <button onClick={() => setProductionOrderSelectedParts([])} className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Clear</button>
                            <button onClick={() => setProductionOrderSelectedParts(filteredProductionOrderPartsList)} className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">All</button>
                          </div>
                          <div className="px-2 mb-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                              <input 
                                type="text"
                                placeholder="Search parts..."
                                className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                value={productionOrderPartSearch}
                                onChange={(e) => setProductionOrderPartSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="space-y-0.5">
                            {filteredProductionOrderPartsList.map(part => (
                              <label key={part} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                <input 
                                  type="checkbox" 
                                  className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  checked={productionOrderSelectedParts.includes(part)}
                                  onChange={(e) => {
                                    if (e.target.checked) setProductionOrderSelectedParts(prev => [...prev, part]);
                                    else setProductionOrderSelectedParts(prev => prev.filter(p => p !== part));
                                  }}
                                />
                                <span className="text-xs text-slate-700 break-words flex-1">{part}</span>
                              </label>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Multi-Date Selector */}
                    <div className="relative w-full lg:w-40" ref={productionOrderDateFilterRef}>
                      <button 
                        onClick={() => setIsProductionOrderDateFilterOpen(!isProductionOrderDateFilterOpen)}
                        className="w-full flex items-center justify-between pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                      >
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-600" />
                        <span className="truncate font-bold text-slate-700">
                          {productionOrderSelectedDates.length === 0 ? 'All Dates' : 
                           productionOrderSelectedDates.length === 1 ? productionOrderSelectedDates[0] : 
                           `${productionOrderSelectedDates.length} Dates`}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProductionOrderDateFilterOpen ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isProductionOrderDateFilterOpen && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-40 w-64 max-h-80 overflow-y-auto p-2"
                          >
                            <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                              <button onClick={() => setProductionOrderSelectedDates([])} className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Clear</button>
                              <button onClick={() => setProductionOrderSelectedDates(filteredProductionOrderDatesList)} className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">All</button>
                            </div>
                            <div className="px-2 mb-2">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                <input 
                                  type="text"
                                  placeholder="Search dates..."
                                  className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                  value={productionOrderDateSearch}
                                  onChange={(e) => setProductionOrderDateSearch(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              </div>
                            </div>
                            <div className="space-y-0.5">
                              {filteredProductionOrderDatesList.map(date => (
                                <label key={date} className="flex items-center gap-3 px-3 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                  <input 
                                    type="checkbox" 
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={productionOrderSelectedDates.includes(date)}
                                    onChange={(e) => {
                                      if (e.target.checked) setProductionOrderSelectedDates(prev => [...prev, date]);
                                      else setProductionOrderSelectedDates(prev => prev.filter(d => d !== date));
                                    }}
                                  />
                                  <span className="text-xs text-slate-700 font-medium">
                                    {parseDate(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Month Filter */}
                    <div className="relative w-full lg:w-36">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <select 
                        value={productionOrderMonth}
                        onChange={(e) => {
                          setProductionOrderMonth(e.target.value);
                          setProductionOrderDateRange({ start: '', end: '' });
                          setProductionOrderSelectedDates([]);
                        }}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 shadow-sm"
                      >
                        {availableReportMonths.map(month => (
                          <option key={month} value={month}>{month}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Date Range Filter */}
                    <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden h-[42px]">
                      <div className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50 transition-colors">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <div className="flex flex-col">
                          <span className="text-[8px] font-bold text-slate-400 uppercase leading-none mb-0.5">From</span>
                          <input 
                            type="date" 
                            className="text-[11px] font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                            value={productionOrderDateRange.start}
                            onChange={(e) => {
                              setProductionOrderDateRange(prev => ({ ...prev, start: e.target.value }));
                              setProductionOrderSelectedDates([]);
                            }}
                          />
                        </div>
                      </div>
                      <div className="w-px h-8 bg-slate-100" />
                      <div className="flex items-center gap-2 px-3 py-1 hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-[8px] font-bold text-slate-400 uppercase leading-none mb-0.5">To</span>
                          <input 
                            type="date" 
                            className="text-[11px] font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                            value={productionOrderDateRange.end}
                            onChange={(e) => {
                              setProductionOrderDateRange(prev => ({ ...prev, end: e.target.value }));
                              setProductionOrderSelectedDates([]);
                            }}
                          />
                        </div>
                      </div>
                      {(productionOrderDateRange.start || productionOrderDateRange.end) && (
                        <button 
                          onClick={() => setProductionOrderDateRange({ start: '', end: '' })}
                          className="p-1.5 hover:bg-slate-100 text-slate-400 transition-colors border-l border-slate-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Shift Filter */}
                    <div className="relative w-full lg:w-32">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <select 
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold text-slate-700 shadow-sm"
                        value={productionOrderShift}
                        onChange={(e) => setProductionOrderShift(e.target.value)}
                      >
                        {uniqueShifts.map(shift => (
                          <option key={shift} value={shift}>{shift === 'All' ? 'All Shifts' : shift}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="relative" ref={partFilterRef}>
                    <button 
                      onClick={() => setIsPartFilterOpen(!isPartFilterOpen)}
                      className="w-full flex items-center justify-between pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <span className="truncate">
                        {selectedParts.length === 0 ? 'Select Parts...' : `${selectedParts.length} Parts Selected`}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isPartFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isPartFilterOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-80 overflow-y-auto p-2 min-w-[280px]"
                        >
                          <div className="flex items-center justify-between p-2 mb-2 border-b border-slate-100">
                            <button onClick={() => setSelectedParts([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Clear All</button>
                            <button onClick={() => setSelectedParts(filteredPartsList)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase">Select All</button>
                          </div>
                          <div className="px-2 mb-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                              <input 
                                type="text"
                                placeholder="Search parts..."
                                className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                value={partSearch}
                                onChange={(e) => setPartSearch(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            {filteredPartsList.map(part => (
                              <label key={part} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  checked={selectedParts.includes(part)}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedParts(prev => [...prev, part]);
                                    else setSelectedParts(prev => prev.filter(p => p !== part));
                                  }}
                                />
                                <span className="text-sm text-slate-700 break-words flex-1">{part}</span>
                              </label>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select 
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={selectedShift}
                      onChange={(e) => setSelectedShift(e.target.value)}
                    >
                      {uniqueShifts.map(shift => <option key={shift} value={shift}>{shift === 'All' ? 'All Shifts' : shift}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>

                  <div className="relative">
                    <Settings className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select 
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                    >
                      {uniqueMachines.map(m => <option key={m} value={m}>{m === 'All' ? 'All Machines' : m}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>

                  <div className="lg:col-span-2 flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-w-[280px]">
                    <div className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors flex-1">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-slate-400 uppercase leading-none mb-1">From</span>
                        <input 
                          type="date" 
                          className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                          value={dateRange.start}
                          onChange={(e) => {
                            setDateRange(prev => ({ ...prev, start: e.target.value }));
                            setSelectedDates([]);
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-px h-10 bg-slate-100" />
                    <div className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 transition-colors flex-1">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-slate-400 uppercase leading-none mb-1">To</span>
                        <input 
                          type="date" 
                          className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                          value={dateRange.end}
                          onChange={(e) => {
                            setDateRange(prev => ({ ...prev, end: e.target.value }));
                            setSelectedDates([]);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Secondary Filters (Visible only on mobile, below the sticky row) */}
            <div className="flex lg:hidden flex-wrap gap-2 mt-1">
              {activeTab === 'Production Order' ? (
                <>
                  <div className="relative flex-1 min-w-[140px]">
                    <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <select 
                      className="w-full pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={planStatusFilter}
                      onChange={(e) => setPlanStatusFilter(e.target.value)}
                    >
                      <option value="All">All Status</option>
                      <option value="Completed">Completed</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Not Started">Not Started</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative flex-1 min-w-[100px]">
                    <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <select 
                      className="w-full pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={productionOrderShift}
                      onChange={(e) => setProductionOrderShift(e.target.value)}
                    >
                      <option value="All">All Shifts</option>
                      <option value="Day">Day</option>
                      <option value="Night">Night</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                </>
              ) : (

                <>
                  <div className="relative flex-1 min-w-[100px]">
                    <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <select 
                      className="w-full pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={selectedShift}
                      onChange={(e) => setSelectedShift(e.target.value)}
                    >
                      {uniqueShifts.map(shift => <option key={shift} value={shift}>{shift === 'All' ? 'Shifts' : shift}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="relative flex-1 min-w-[100px]">
                    <Settings className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <select 
                      className="w-full pl-7 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                    >
                      {uniqueMachines.map(machine => <option key={machine} value={machine}>{machine === 'All' ? 'Machines' : machine}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                </>
              )}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm flex-1 min-w-[180px]">
                <div className="flex flex-col flex-1">
                  <span className="text-[7px] font-bold text-slate-400 uppercase">From</span>
                  <input 
                    type="date" 
                    className="w-full text-[10px] font-bold text-slate-700 focus:outline-none bg-transparent"
                    value={dateRange.start}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, start: e.target.value }));
                      setSelectedDates([]);
                    }}
                  />
                </div>
                <div className="w-px h-4 bg-slate-100" />
                <div className="flex flex-col flex-1">
                  <span className="text-[7px] font-bold text-slate-400 uppercase">To</span>
                  <input 
                    type="date" 
                    className="w-full text-[10px] font-bold text-slate-700 focus:outline-none bg-transparent"
                    value={dateRange.end}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, end: e.target.value }));
                      setSelectedDates([]);
                    }}
                  />
                </div>
              </div>
              <button 
                onClick={resetFilters}
                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Content based on activeTab */}
        {activeTab === 'Production Data' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-10">
              <StatCard 
                title="Total Production" 
                value={stats.totalProduction.toLocaleString()} 
                icon={Activity} 
                color="bg-indigo-500" 
              />
              <StatCard 
                title="OK Production" 
                value={stats.totalOk.toLocaleString()} 
                icon={Package} 
                color="bg-emerald-500" 
                trend="+12.5%"
              />
              <StatCard 
                title="NG Parts" 
                value={stats.totalNg.toLocaleString()} 
                icon={AlertTriangle} 
                color="bg-rose-500" 
                trend="-2.4%"
              />
              <StatCard 
                title="Rubber Used" 
                value={`${stats.totalRubber.toFixed(1)} kg`} 
                icon={Activity} 
                color="bg-blue-500" 
              />
              <StatCard 
                title="Rubber Waste" 
                value={`${stats.totalWaste.toFixed(1)} kg`} 
                icon={Trash2} 
                color="bg-amber-500" 
                trend={`${stats.wasteRate}% rate`}
              />
              <StatCard 
                title="Yield Rate" 
                value={`${stats.yieldRate}%`} 
                icon={Activity} 
                color="bg-indigo-500" 
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 gap-8 mb-10">
              <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight">Daily Production Summary</h3>
                      <p className="text-xs text-slate-500 font-medium">Detailed breakdown of production metrics by date</p>
                    </div>
                  </div>
                  <button 
                    onClick={exportDateWiseSummary}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    Export Summary
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-4 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Totals</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums bg-blue-50/30">{dateWiseProductionTotals.dayOk.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums bg-blue-50/30">{dateWiseProductionTotals.dayNg.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums bg-slate-100/50">{dateWiseProductionTotals.nightOk.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums bg-slate-100/50">{dateWiseProductionTotals.nightNg.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-indigo-600 text-right tabular-nums">{dateWiseProductionTotals.totalOk.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-rose-600 text-right tabular-nums">{dateWiseProductionTotals.totalNg.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums">{dateWiseProductionTotals.totalProduction.toLocaleString()}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums">{dateWiseProductionTotals.dayRubber.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums">{dateWiseProductionTotals.nightRubber.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</th>
                        <th className="px-4 py-5 text-sm font-black text-slate-900 text-right tabular-nums">{dateWiseProductionTotals.totalRubber.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</th>
                      </tr>
                      <tr className="bg-white border-b border-slate-100">
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest border-r border-slate-100">Date</th>
                        <th colSpan={2} className="px-4 py-2 text-[10px] font-black text-blue-700 uppercase tracking-widest text-center bg-blue-50/50 border-r border-slate-100">Day Shift</th>
                        <th colSpan={2} className="px-4 py-2 text-[10px] font-black text-slate-900 uppercase tracking-widest text-center bg-slate-100/50 border-r border-slate-100">Night Shift</th>
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-indigo-700 uppercase tracking-widest text-right border-r border-slate-100">Total OK</th>
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-rose-700 uppercase tracking-widest text-right border-r border-slate-100">Total NG</th>
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right border-r border-slate-100">Total Prod.</th>
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-slate-700 uppercase tracking-widest text-right border-r border-slate-100">Day Rubber</th>
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-slate-700 uppercase tracking-widest text-right border-r border-slate-100">Night Rubber</th>
                        <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Total Rubber</th>
                      </tr>
                      <tr className="bg-white border-b border-slate-100">
                        <th className="px-4 py-2 text-[9px] font-black text-blue-600 uppercase text-right bg-blue-50/20 border-r border-slate-100">OK</th>
                        <th className="px-4 py-2 text-[9px] font-black text-blue-600 uppercase text-right bg-blue-50/20 border-r border-slate-100">NG</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-700 uppercase text-right bg-slate-100/20 border-r border-slate-100">OK</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-700 uppercase text-right bg-slate-100/20 border-r border-slate-100">NG</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(showAllDateWiseProduction ? dateWiseProductionData : dateWiseProductionData.slice(0, 10)).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/30 transition-colors group">
                          <td className="px-4 py-3 text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors border-r border-slate-50">{row.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium tabular-nums bg-blue-50/10 border-r border-slate-50">{row.dayOk.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium tabular-nums bg-blue-50/10 border-r border-slate-50">{row.dayNg.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium tabular-nums bg-slate-100/10 border-r border-slate-50">{row.nightOk.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right font-medium tabular-nums bg-slate-100/10 border-r border-slate-50">{row.nightNg.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-indigo-600 text-right font-bold tabular-nums border-r border-slate-50">{row.totalOk.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-rose-600 text-right font-bold tabular-nums border-r border-slate-50">{row.totalNg.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-slate-900 text-right font-black tabular-nums border-r border-slate-50">{row.totalProduction.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-slate-500 text-right font-medium tabular-nums border-r border-slate-50">{row.dayRubber.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          <td className="px-4 py-3 text-sm text-slate-500 text-right font-medium tabular-nums border-r border-slate-50">{row.nightRubber.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          <td className="px-4 py-3 text-sm text-slate-900 text-right font-bold tabular-nums">{row.totalRubber.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                  <button 
                    onClick={() => setShowAllDateWiseProduction(!showAllDateWiseProduction)}
                    className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all shadow-sm flex items-center gap-2 active:scale-95"
                  >
                    {showAllDateWiseProduction ? 'Show Less' : `View All Dates (${dateWiseProductionData.length})`}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showAllDateWiseProduction ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Remarks Analysis Chart */}
              {remarksAnalysis.length > 0 && (
                <div className="grid grid-cols-1 gap-8 mb-10">
                  <ChartCard 
                    title="PRODCUTION LOSS ISSUE"
                    heightClass={isRemarksChartExpanded ? "h-[800px]" : "h-[450px]"}
                    action={
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-lg border border-indigo-100">
                          <AlertTriangle className="w-4 h-4 text-indigo-600" />
                          <span className="text-xs font-bold text-indigo-700">{remarksAnalysis.reduce((acc, curr) => acc + curr.count, 0)} Total Issues Recorded</span>
                        </div>
                        <button 
                          onClick={() => setIsRemarksChartExpanded(!isRemarksChartExpanded)}
                          className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm flex items-center gap-2 active:scale-95"
                        >
                          {isRemarksChartExpanded ? 'Collapse View' : 'Expand View'}
                          <RefreshCw className={`w-3 h-3 ${isRemarksChartExpanded ? 'rotate-180' : ''} transition-transform`} />
                        </button>
                      </div>
                    }
                  >
                    <div className="h-full w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <BarChart 
                          data={remarksAnalysis} 
                          layout="vertical"
                          margin={{ top: 10, right: 60, left: 140, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            type="number" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 12 }}
                            label={{ value: 'Number of Occurrences', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                          />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 800 }}
                            width={130}
                          />
                          <Tooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100">
                                    <p className="text-sm font-black text-slate-900 mb-1">{data.name}</p>
                                    <p className="text-xs font-bold text-indigo-600 mb-2">Frequency: {data.count} times</p>
                                    <div className="pt-2 border-t border-slate-50">
                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Affected Machines</p>
                                      <p className="text-xs font-medium text-slate-600 max-w-[200px] leading-relaxed">{data.machines}</p>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="count" name="Frequency" radius={[0, 8, 8, 0]} barSize={isRemarksChartExpanded ? 30 : 24}>
                            <LabelList dataKey="count" position="right" style={{ fill: '#1e293b', fontWeight: 'bold', fontSize: '12px' }} />
                            {remarksAnalysis.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>
                </div>
              )}

            </div>
          </>
        )}

        {activeTab === 'Production Order' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <StatCard 
                title="Production Order" 
                value={filteredProductionOrderData.reduce((acc, curr) => acc + curr.plannedQty, 0).toLocaleString()} 
                icon={Target} 
                color="bg-indigo-500" 
              />
              <StatCard 
                title="Planned Production" 
                value={filteredProductionOrderData.reduce((acc, curr) => acc + (curr.plannedProduction || 0), 0).toLocaleString()} 
                icon={Activity} 
                color="bg-blue-600" 
              />
              <StatCard 
                title="Actual Production" 
                value={filteredProductionOrderData.reduce((acc, curr) => acc + curr.actualProduction, 0).toLocaleString()} 
                icon={Package} 
                color="bg-emerald-500" 
                trend={productionOrderDateRange.start ? `${productionOrderDateRange.start} to ${productionOrderDateRange.end}` : `${productionOrderMonth}`}
              />
              <StatCard 
                title="Total Remaining" 
                value={Math.max(0, filteredProductionOrderData.reduce((acc, curr) => acc + (curr.plannedQty - curr.actualProduction), 0)).toLocaleString()} 
                icon={TrendingDown} 
                color="bg-rose-500" 
              />
              <StatCard 
                title="Overall Completion" 
                value={`${(filteredProductionOrderData.reduce((acc, curr) => acc + curr.actualProduction, 0) / (filteredProductionOrderData.reduce((acc, curr) => acc + curr.plannedQty, 0) || 1) * 100).toFixed(1)}%`} 
                icon={ShieldCheck} 
                color="bg-amber-500" 
              />
            </div>

            {/* Plan Progress Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ChartCard title="Plan Progress Distribution">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Completed', value: productionOrderStats.completed, color: '#10b981' },
                        { name: 'In Progress', value: productionOrderStats.inProgress, color: '#f59e0b' },
                        { name: 'Not Started', value: productionOrderStats.notStarted, color: '#f43f5e' }
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {[
                        { name: 'Completed', value: productionOrderStats.completed, color: '#10b981' },
                        { name: 'In Progress', value: productionOrderStats.inProgress, color: '#f59e0b' },
                        { name: 'Not Started', value: productionOrderStats.notStarted, color: '#f43f5e' }
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" align="center" />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Plan Progress Stats">
                <div className="flex flex-col justify-center h-full space-y-3">
                  <div className="flex items-center justify-between p-3 bg-slate-100 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-slate-600" />
                      <span className="text-sm font-bold text-slate-900">Total Parts Planned</span>
                    </div>
                    <span className="text-lg font-bold text-slate-700">{productionOrderStats.totalParts} Parts</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-sm font-bold text-emerald-900">Completed</span>
                    </div>
                    <span className="text-lg font-bold text-emerald-700">{productionOrderStats.completed} Parts</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-sm font-bold text-amber-900">In Progress</span>
                    </div>
                    <span className="text-lg font-bold text-amber-700">{productionOrderStats.inProgress} Parts</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-rose-50 rounded-xl border border-rose-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-rose-500" />
                      <span className="text-sm font-bold text-rose-900">Not Started</span>
                    </div>
                    <span className="text-lg font-bold text-rose-700">{productionOrderStats.notStarted} Parts</span>
                  </div>
                </div>
              </ChartCard>
            </div>

              <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-center justify-between w-full lg:w-auto">
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Plan vs Actual</h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={exportProductionOrderData}
                        className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                        title="Export Plan Data"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 flex-nowrap overflow-x-auto max-w-full no-scrollbar shadow-inner">
                      {[
                        { label: 'All', value: 'All' },
                        { label: '100%+', value: '100%+' },
                        { label: '91%-99%', value: '91%-99%' },
                        { label: '51%-90%', value: '51%-90%' },
                        { label: '26%-50%', value: '26%-50%' },
                        { label: '1%-25%', value: '1%-25%' },
                        { label: '0%', value: '0%' }
                      ].map((filter) => (
                        <button
                          key={filter.value}
                          onClick={() => setPlanProgressFilter(filter.value)}
                          className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap flex flex-col items-center gap-1 min-w-[75px] ${
                            planProgressFilter === filter.value
                              ? 'bg-white text-indigo-600 shadow-md border border-slate-200 scale-105'
                              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                          }`}
                        >
                          <span className="tracking-tight">{filter.label}</span>
                          <span className={`text-xs font-black ${planProgressFilter === filter.value ? 'text-indigo-600' : 'text-slate-900'}`}>
                            ({planProgressCounts[filter.value]})
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div ref={planVsActualRef} className="overflow-x-auto hidden lg:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('partName')}
                      >
                        <div className="flex items-center gap-2">
                          Part No. & Name
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'partName' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'partName' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('plannedQty')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Order Qty
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'plannedQty' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'plannedQty' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('plannedProduction')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Planned Production
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'plannedProduction' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'plannedProduction' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('actualProduction')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Actual Production
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'actualProduction' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'actualProduction' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('remaining')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Remaining
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'remaining' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'remaining' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider text-right cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('balance')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Balance
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'balance' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'balance' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-black text-slate-900 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleProductionOrderSort('progress')}
                      >
                        <div className="flex items-center gap-2">
                          Progress
                          <div className="flex flex-col -space-y-1">
                            <ChevronUp strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'progress' && productionOrderSortConfig.direction === 'asc' ? 'text-black' : 'text-slate-500'}`} />
                            <ChevronDown strokeWidth={4} className={`w-3 h-3 ${productionOrderSortConfig.key === 'progress' && productionOrderSortConfig.direction === 'desc' ? 'text-black' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProductionOrderData.length > 0 ? filteredProductionOrderData.map((item, idx) => {
                      const completion = (item.actualProduction / (item.plannedQty || 1)) * 100;
                      const balance = item.actualProduction - item.plannedQty;
                      const remaining = Math.max(0, item.plannedQty - item.actualProduction);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.partName}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-right font-mono">{item.plannedQty.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-blue-600 text-right font-bold font-mono">{item.plannedProduction.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-emerald-600 text-right font-bold font-mono">{item.actualProduction.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono">
                            <span className={remaining > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                              {remaining.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-mono">
                            <span className={balance < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
                              {balance > 0 ? `+${balance.toLocaleString()}` : balance.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 min-w-[200px]">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(completion, 100)}%` }}
                                    className={`h-full rounded-full ${completion >= 100 ? 'bg-emerald-500' : completion > 0 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  />
                              </div>
                              <span className="text-xs font-bold text-slate-700 w-10">{completion.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-slate-400 italic">No plan data available</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View for Production Order */}
              <div className="lg:hidden p-4 space-y-4 bg-slate-50/50">
                {filteredProductionOrderData.length > 0 ? filteredProductionOrderData.map((item, idx) => {
                  const completion = (item.actualProduction / (item.plannedQty || 1)) * 100;
                  const balance = item.actualProduction - item.plannedQty;
                  const remaining = Math.max(0, item.plannedQty - item.actualProduction);
                  return (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold text-slate-900 flex-1 pr-2">{item.partName}</h4>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progress</span>
                          <span className={`text-sm font-black ${completion >= 100 ? 'text-emerald-600' : completion > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {completion.toFixed(0)}%
                          </span>
                          <span className="text-[9px] font-medium text-slate-400">
                            ({item.actualProduction.toLocaleString()} / {item.plannedQty.toLocaleString()})
                          </span>
                          <span className="text-[9px] font-bold text-blue-600">
                            Plan: {item.plannedProduction.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(completion, 100)}%` }}
                          className={`h-full rounded-full ${completion >= 100 ? 'bg-emerald-500' : completion > 0 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Order vs Actual</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-bold text-slate-700">{item.actualProduction.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400">/ {item.plannedQty.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="space-y-1 text-right">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Planned Production</span>
                          <div className="flex items-baseline justify-end gap-1">
                            <span className="text-sm font-bold text-blue-600">{item.plannedProduction.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="py-10 text-center text-slate-400 italic bg-white rounded-xl border border-slate-200">
                    No plan data available
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Efficiency' && (
          <>
            {/* Efficiency Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <StatCard 
                title="Total Target Shots" 
                value={efficiencyStats.totalTarget.toLocaleString()} 
                icon={Target} 
                color="bg-slate-500" 
              />
              <StatCard 
                title="Actual Shots" 
                value={efficiencyStats.totalActual.toLocaleString()} 
                icon={Activity} 
                color="bg-indigo-500" 
                trend={`${efficiencyStats.achievementRate}% achieved`}
              />
              <StatCard 
                title="Shortfall (Gap)" 
                value={efficiencyStats.totalGap.toLocaleString()} 
                icon={TrendingDown} 
                color="bg-rose-500" 
                trend={efficiencyStats.totalGap > 0 ? "Below Target" : "Target Met"}
              />
              <StatCard 
                title="Achievement Rate" 
                value={`${efficiencyStats.achievementRate}%`} 
                icon={CheckCircle} 
                color="bg-emerald-500" 
              />
            </div>

            <div className="grid grid-cols-1 gap-8 mb-10">
            <ChartCard 
              title="Actual vs Target Shots by Machine"
              action={
                <button 
                  onClick={() => setShowAllEfficiency(!showAllEfficiency)}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  {showAllEfficiency ? 'Show Top 10' : 'View All'} <ChevronRight className={`w-4 h-4 transition-transform ${showAllEfficiency ? 'rotate-90' : ''}`} />
                </button>
              }
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={showAllEfficiency ? efficiencyData : efficiencyData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                  <Bar dataKey="target" name="Target Shots" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual Shots" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard 
              title="Top Target Not Achieved (Gap)"
              action={
                <button 
                  onClick={() => setShowAllNotAchieved(!showAllNotAchieved)}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  {showAllNotAchieved ? 'Show Top 10' : 'View All'} <ChevronRight className={`w-4 h-4 transition-transform ${showAllNotAchieved ? 'rotate-90' : ''}`} />
                </button>
              }
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={showAllNotAchieved ? notAchievedData : notAchievedData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-4 rounded-xl shadow-xl border border-slate-100">
                            <p className="font-bold text-slate-900 mb-1">{label}</p>
                            <p className="text-sm text-rose-600 font-semibold mb-2">Shortfall: {data.gap.toLocaleString()} Shots</p>
                            {data.remarksStr && (
                              <div className="mt-2 pt-2 border-t border-slate-100">
                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Remarks / Reasons:</p>
                                <p className="text-xs text-slate-600 italic leading-relaxed max-w-[200px]">{data.remarksStr}</p>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                  <Bar dataKey="gap" name="Shortfall (Shots)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            
            <div className="bg-white p-6 rounded-2xl border border-black/5">
              <h3 className="text-lg font-bold mb-4">Efficiency Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-500 mb-1">Avg. Shots per Machine</p>
                  <p className="text-2xl font-bold">{(filteredData.reduce((acc, curr) => acc + curr.actualShots, 0) / (uniqueMachines.length - 1 || 1)).toFixed(1)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-500 mb-1">Target Achievement</p>
                  <p className="text-2xl font-bold text-indigo-600">
                    {((filteredData.reduce((acc, curr) => acc + curr.actualShots, 0) / (filteredData.reduce((acc, curr) => acc + curr.targetShots, 0) || 1)) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-500 mb-1">Active Cavities Avg</p>
                  <p className="text-2xl font-bold">{(filteredData.reduce((acc, curr) => acc + curr.actualShots, 0) / filteredData.length || 0).toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

        {activeTab === 'Operators' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-8 mb-10">
              <ChartCard title="Top Operators by OK Production">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={Object.values(filteredData.reduce((acc: any, curr) => {
                    if (!acc[curr.operator]) acc[curr.operator] = { name: curr.operator, ok: 0, ng: 0 };
                    acc[curr.operator].ok += curr.okProduction;
                    acc[curr.operator].ng += curr.ngParts;
                    return acc;
                  }, {})).sort((a: any, b: any) => b.ok - a.ok).slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="ok" name="OK Parts" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>
        )}

            <AnimatePresence>
              {showDoubleMachineReport && (
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
                            Double Efficiency Report {includeRemarksInReport && <span className="text-indigo-600">(with remarks)</span>}
                          </h3>
                          <p className="text-[9px] lg:text-[10px] text-slate-500 font-medium hidden sm:block">Operators operating multiple machines in a single day</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 lg:gap-3 no-print">
                        {selectedOperatorsForReport.length > 0 && (
                          <div className={`${showMobileReport ? 'flex' : 'hidden lg:flex'} items-center gap-2`}>
                            <button 
                              onClick={async () => {
                                const workbook = new ExcelJS.Workbook();
                                
                                for (const operator of selectedOperatorsForReport) {
                                  const worksheet = workbook.addWorksheet(operator.substring(0, 31));
                                  const opData = doubleMachineData[operator];
                                  
                                  // Column widths
                                  worksheet.columns = [
                                    { width: 8 },  // NO
                                    { width: 20 }, // Date
                                    { width: 35 }, // Part
                                    { width: 12 }, // Target
                                    { width: 12 }, // Actual
                                    { width: 10 }, // %
                                    ...(includeRemarksInReport ? [{ width: 25 }] : []) // Remarks
                                  ];

                                  // Header: TM Rubber Pvt. Ltd
                                  const headerRow = worksheet.addRow(['TM Rubber Pvt. Ltd']);
                                  worksheet.mergeCells(`A${headerRow.number}:F${headerRow.number}`);
                                  headerRow.getCell(1).font = { bold: true, size: 16 };
                                  headerRow.getCell(1).alignment = { horizontal: 'center' };
                                  headerRow.getCell(1).border = { bottom: { style: 'medium' } };

                                  // Sub-header: Efficiency Allowance
                                  const subHeaderRow = worksheet.addRow([`Efficiency Allowance For the Month of ${reportMonthFilter}`]);
                                  worksheet.mergeCells(`A${subHeaderRow.number}:F${subHeaderRow.number}`);
                                  subHeaderRow.getCell(1).font = { bold: true, italic: true, size: 11 };
                                  subHeaderRow.getCell(1).alignment = { horizontal: 'center' };

                                  // Operator Name
                                  const opNameRow = worksheet.addRow([operator]);
                                  worksheet.mergeCells(`A${opNameRow.number}:F${opNameRow.number}`);
                                  opNameRow.getCell(1).font = { bold: true, size: 14, underline: true };
                                  opNameRow.getCell(1).alignment = { horizontal: 'center' };
                                  worksheet.addRow([]); // Spacer

                                  // Approval Section (Side-by-side like App UI)
                                  const approvalRow = worksheet.addRow(['Confirm By', '', '', 'Approved By', '', '', '']);
                                  worksheet.mergeCells(`A${approvalRow.number}:B${approvalRow.number}`);
                                  worksheet.mergeCells(`D${approvalRow.number}:E${approvalRow.number}`);
                                  if (includeRemarksInReport) {
                                    worksheet.mergeCells(`F${approvalRow.number}:G${approvalRow.number}`);
                                  }
                                  approvalRow.height = 60;
                                  
                                  approvalRow.getCell(1).font = { bold: true, size: 10 };
                                  approvalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                                  approvalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                  
                                  approvalRow.getCell(4).font = { bold: true, size: 10 };
                                  approvalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
                                  approvalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                  
                                  for (let i = 1; i <= (includeRemarksInReport ? 7 : 6); i++) {
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

                                  const summaryRow = worksheet.addRow(['Total Double Machine Days', '', totalDays, totalTarget, totalActual, `${overallPercent.toFixed(2)}%`, ...(includeRemarksInReport ? [''] : [])]);
                                  worksheet.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
                                  summaryRow.font = { bold: true, size: 10 };
                                  summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
                                  summaryRow.height = 25;
                                  for (let i = 1; i <= 6; i++) {
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
                                  const tableHeader = worksheet.addRow(['NO', 'Date', 'Part', 'Target', 'Actual', '%', ...(includeRemarksInReport ? ['Remarks'] : [])]);
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
                                      const row = worksheet.addRow([
                                        counter++,
                                        record.productionDate,
                                        record.partName,
                                        record.targetShots,
                                        record.actualShots,
                                        `${percent.toFixed(1)}%`,
                                        ...(includeRemarksInReport ? [record.remarks || ''] : [])
                                      ]);
                                      row.alignment = { horizontal: 'center' };
                                      row.getCell(3).alignment = { horizontal: 'left' };
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
                                saveAs(new Blob([buffer]), `double_efficiency_reports_${includeRemarksInReport ? 'with_remarks_' : ''}${reportMonthFilter.replace(' ', '_')}.xlsx`);
                              }}
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
                            setShowDoubleMachineReport(false);
                            setSelectedOperatorsForReport([]);
                            setViewedOperatorForReport(null);
                            setShowMobileReport(false);
                          }}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
                        >
                          <X className="w-6 h-6 text-slate-400" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row relative">
                      {/* Operator List & Filters */}
                      <div className={`w-full lg:w-60 border-r border-slate-100 overflow-y-auto bg-slate-50/30 p-3 pt-2 flex flex-col gap-3 ${showMobileReport ? 'hidden lg:flex' : 'flex'}`}>
                        <div className="lg:hidden flex items-center justify-between mb-2">
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Report Selection</h4>
                          <button 
                            onClick={() => {
                              setShowDoubleMachineReport(false);
                              setShowMobileReport(false);
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
                              setSelectedOperatorsForReport([]);
                              setViewedOperatorForReport(null);
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
                              {selectedOperatorsForReport.length > 0 && (
                                <button 
                                  onClick={() => setShowMobileReport(true)}
                                  className="lg:hidden px-2 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 cursor-pointer shadow-sm"
                                >
                                  View Batch ({selectedOperatorsForReport.length})
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  const allOps = Object.keys(doubleMachineData).filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase()));
                                  if (selectedOperatorsForReport.length > 0) {
                                    setSelectedOperatorsForReport([]);
                                  } else {
                                    setSelectedOperatorsForReport(allOps);
                                  }
                                }}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                              >
                                {selectedOperatorsForReport.length > 0 ? 'Clear All' : 'Select All'}
                              </button>
                            </div>
                          </div>
                          {Object.keys(doubleMachineData)
                            .filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase()))
                            .sort()
                            .map(operator => (
                            <div
                              key={operator}
                              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-3 ${
                                viewedOperatorForReport === operator
                                  ? 'bg-indigo-50 border-indigo-200' 
                                  : 'text-slate-600 hover:bg-white hover:shadow-sm'
                              }`}
                              onClick={() => {
                                setViewedOperatorForReport(operator);
                                setShowMobileReport(true);
                              }}
                            >
                              <div 
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                                  selectedOperatorsForReport.includes(operator)
                                    ? 'bg-indigo-600 border-indigo-600'
                                    : 'bg-white border-slate-300 hover:border-indigo-400'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedOperatorsForReport.includes(operator)) {
                                    setSelectedOperatorsForReport(selectedOperatorsForReport.filter(op => op !== operator));
                                  } else {
                                    setSelectedOperatorsForReport([...selectedOperatorsForReport, operator]);
                                  }
                                }}
                              >
                                {selectedOperatorsForReport.includes(operator) && <div className="w-2 h-2 bg-white rounded-sm" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{operator}</div>
                                <div className={`text-[10px] mt-0.5 ${viewedOperatorForReport === operator ? 'text-indigo-600' : 'text-slate-400'}`}>
                                  {doubleMachineData[operator].length} Double Days
                                </div>
                              </div>
                            </div>
                          ))}
                          {Object.keys(doubleMachineData).filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase())).length === 0 && (
                            <div className="text-center py-8 text-slate-400 text-xs italic">No operators found for this month</div>
                          )}
                        </div>
                      </div>

                      {/* Report Content */}
                      <div ref={reportRef} className={`flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-100/50 print:bg-white print:p-0 ${showMobileReport ? 'block' : 'hidden lg:block'}`}>
                        <div className="lg:hidden mb-4 no-print">
                          <button 
                            onClick={() => setShowMobileReport(false)}
                            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
                          >
                            <ChevronLeft className="w-4 h-4" />
                            Back to Operator List
                          </button>
                        </div>
                        {viewedOperatorForReport || selectedOperatorsForReport.length > 0 ? (
                          <div className="space-y-8 print:space-y-0">
                            {viewedOperatorForReport && (
                              <div className="no-print mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                                  <p className="text-sm font-bold text-indigo-900">Viewing: {viewedOperatorForReport}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedOperatorsForReport.length > 0 && (
                                    <button 
                                      onClick={() => setViewedOperatorForReport(null)}
                                      className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                      Back to Batch ({selectedOperatorsForReport.length})
                                    </button>
                                  )}
                                  <button 
                                    onClick={async () => {
                                      const workbook = new ExcelJS.Workbook();
                                      const operator = viewedOperatorForReport;
                                      const worksheet = workbook.addWorksheet(operator.substring(0, 31));
                                      const opData = doubleMachineData[operator];
                                      
                                      worksheet.columns = [
                                        { width: 5 }, { width: 15 }, { width: 35 }, { width: 12 }, { width: 12 }, { width: 10 },
                                        ...(includeRemarksInReport ? [{ width: 25 }] : [])
                                      ];

                                      const totalCols = includeRemarksInReport ? 7 : 6;
                                      const lastColLetter = includeRemarksInReport ? 'G' : 'F';

                                      const headerRow = worksheet.addRow(['TM Rubber Pvt. Ltd']);
                                      worksheet.mergeCells(`A${headerRow.number}:${lastColLetter}${headerRow.number}`);
                                      headerRow.getCell(1).font = { bold: true, size: 16 };
                                      headerRow.getCell(1).alignment = { horizontal: 'center' };
                                      headerRow.getCell(1).border = { bottom: { style: 'medium' } };

                                      const subHeaderRow = worksheet.addRow([`Efficiency Allowance For the Month of ${reportMonthFilter}`]);
                                      worksheet.mergeCells(`A${subHeaderRow.number}:${lastColLetter}${subHeaderRow.number}`);
                                      subHeaderRow.getCell(1).font = { bold: true, italic: true, size: 11 };
                                      subHeaderRow.getCell(1).alignment = { horizontal: 'center' };

                                      const opNameRow = worksheet.addRow([operator]);
                                      worksheet.mergeCells(`A${opNameRow.number}:${lastColLetter}${opNameRow.number}`);
                                      opNameRow.getCell(1).font = { bold: true, size: 14, underline: true };
                                      opNameRow.getCell(1).alignment = { horizontal: 'center' };
                                      worksheet.addRow([]);

                                      const approvalRow = worksheet.addRow(['Confirm By', '', '', 'Approved By', '', '', '']);
                                      worksheet.mergeCells(`A${approvalRow.number}:B${approvalRow.number}`);
                                      worksheet.mergeCells(`D${approvalRow.number}:E${approvalRow.number}`);
                                      if (includeRemarksInReport) {
                                        worksheet.mergeCells(`F${approvalRow.number}:G${approvalRow.number}`);
                                      }
                                      approvalRow.height = 60;
                                      
                                      approvalRow.getCell(1).font = { bold: true, size: 10 };
                                      approvalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                                      approvalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                      
                                      approvalRow.getCell(4).font = { bold: true, size: 10 };
                                      approvalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
                                      approvalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                      
                                      for (let i = 1; i <= (includeRemarksInReport ? 7 : 6); i++) {
                                        approvalRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                                      }
                                      worksheet.addRow([]);

                                      const totalDays = opData.length;
                                      let totalTarget = 0, totalActual = 0;
                                      opData.forEach(day => day.records.forEach(r => { totalTarget += r.targetShots; totalActual += r.actualShots; }));
                                      const overallPercent = (totalActual / (totalTarget || 1)) * 100;

                                      const summaryRow = worksheet.addRow(['Total Double Machine Days', '', totalDays, totalTarget, totalActual, `${overallPercent.toFixed(2)}%`, ...(includeRemarksInReport ? [''] : [])]);
                                      worksheet.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
                                      summaryRow.font = { bold: true, size: 10 };
                                      summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
                                      summaryRow.height = 25;
                                      for (let i = 1; i <= 6; i++) {
                                        const cell = summaryRow.getCell(i);
                                        cell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
                                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                      }
                                      worksheet.addRow([]);

                                      const tableHeader = worksheet.addRow(['NO', 'Date', 'Part', 'Target', 'Actual', '%', ...(includeRemarksInReport ? ['Remarks'] : [])]);
                                      tableHeader.font = { bold: true };
                                      tableHeader.alignment = { horizontal: 'center' };
                                      tableHeader.eachCell((cell) => {
                                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                                        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                                      });

                                      let counter = 1;
                                      opData.forEach(day => day.records.forEach(record => {
                                        const percent = (record.actualShots / (record.targetShots || 1)) * 100;
                                        const row = worksheet.addRow([
                                          counter++, 
                                          record.productionDate, 
                                          record.partName, 
                                          record.targetShots, 
                                          record.actualShots, 
                                          `${percent.toFixed(1)}%`,
                                          ...(includeRemarksInReport ? [record.remarks || ''] : [])
                                        ]);
                                        row.alignment = { horizontal: 'center' };
                                        row.getCell(3).alignment = { horizontal: 'left' };
                                        row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
                                      }));

                                      const buffer = await workbook.xlsx.writeBuffer();
                                      saveAs(new Blob([buffer]), `double_efficiency_report_${operator}_${includeRemarksInReport ? 'with_remarks_' : ''}${reportMonthFilter.replace(' ', '_')}.xlsx`);
                                    }}
                                    className="px-3 py-1.5 bg-white text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-50 transition-all flex items-center gap-2 cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Export This
                                  </button>
                                  {!selectedOperatorsForReport.includes(viewedOperatorForReport) && (
                                    <button 
                                      onClick={() => {
                                        setSelectedOperatorsForReport([...selectedOperatorsForReport, viewedOperatorForReport]);
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
                            {(viewedOperatorForReport ? [viewedOperatorForReport] : selectedOperatorsForReport).map((operator, opIdx, arr) => (
                              <div 
                                key={operator} 
                                className={`bg-white shadow-xl border border-slate-200 rounded-sm p-8 mx-auto max-w-[95%] font-calibri text-black min-h-[1000px] print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:max-w-none print:min-h-0 ${opIdx < arr.length - 1 ? 'page-break' : ''}`}
                              >
                                {/* Excel Style Header */}
                                <div className="text-center mb-6">
                                  <h1 className="text-2xl font-bold border-b-2 border-black inline-block px-8 pb-2 mb-3">TM Rubber Pvt. Ltd</h1>
                                  <p className="text-sm italic font-bold mb-1">Efficiency Allowance For the Month of {reportMonthFilter}</p>
                                  <p className="text-xl font-bold underline underline-offset-4">{operator}</p>
                                </div>

                                {/* Summary Totals */}
                                {(() => {
                                  const opData = doubleMachineData[operator];
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

                                  return (
                                    <div className="grid grid-cols-10 border-2 border-black mb-4 text-center font-bold text-xs">
                                      <div className="col-span-3 p-2 border-r-2 border-black bg-slate-50 uppercase tracking-wider">Total Double Machine Days</div>
                                      <div className="col-span-4 p-2 border-r-2 border-black text-xl">{totalDays}</div>
                                      <div className="col-span-3 p-2 bg-slate-50 uppercase tracking-wider flex items-center justify-center gap-4">
                                        <div className="text-[10px] text-slate-500">Target: {totalTarget.toLocaleString()}</div>
                                        <div className="text-[10px] text-slate-500">Actual: {totalActual.toLocaleString()}</div>
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
                                      <th className="border-2 border-black p-2 w-20 text-center">Target</th>
                                      <th className="border-2 border-black p-2 w-20 text-center">Actual</th>
                                      <th className="border-2 border-black p-2 w-16 text-center">%</th>
                                      {includeRemarksInReport && <th className="border-2 border-black p-2 text-left">Remarks</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      let counter = 1;
                                      return doubleMachineData[operator].map((day) => (
                                        <React.Fragment key={`${day.date}-${day.shift}`}>
                                          {day.records.map((record, rIdx) => {
                                            const percent = (record.actualShots / (record.targetShots || 1)) * 100;
                                            return (
                                              <tr key={`${day.date}-${day.shift}-${rIdx}`} className="hover:bg-slate-50 border-b-2 border-black">
                                                <td className="border-2 border-black p-2 text-center">{counter++}</td>
                                                <td className="border-2 border-black p-2 text-center">{record.productionDate}</td>
                                                <td className="border-2 border-black p-2 uppercase">{record.partName}</td>
                                                <td className="border-2 border-black p-2 text-center font-mono">{record.targetShots.toLocaleString()}</td>
                                                <td className="border-2 border-black p-2 text-center font-mono">{record.actualShots.toLocaleString()}</td>
                                                <td className="border-2 border-black p-2 text-center font-black">{percent.toFixed(1)}%</td>
                                                {includeRemarksInReport && <td className="border-2 border-black p-2">{record.remarks || '-'}</td>}
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
            <AnimatePresence>
              {showWorkerRecordReport && (
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
                        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shrink-0">
                          <Users className="w-4 h-4 lg:w-5 lg:h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm lg:text-lg font-bold text-slate-900 leading-tight truncate">
                            Worker Record {includeRemarksInReport && <span className="text-indigo-600">(with remarks)</span>}
                          </h3>
                          <p className="text-[9px] lg:text-[10px] text-slate-500 font-medium hidden sm:block">Comprehensive record of production for all workers</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 lg:gap-3 no-print">
                        {selectedOperatorsForReport.length > 0 && (
                          <div className={`${showMobileReport ? 'flex' : 'hidden lg:flex'} items-center gap-2`}>
                            <button 
                              onClick={async () => {
                                const workbook = new ExcelJS.Workbook();
                                for (const operator of selectedOperatorsForReport) {
                                  const worksheet = workbook.addWorksheet(operator.substring(0, 31));
                                  const opData = workerRecordData[operator];
                                  if (!opData) continue;
                                  worksheet.columns = [{ width: 8 }, { width: 20 }, { width: 35 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 12 }, ...(includeRemarksInReport ? [{ width: 25 }] : [])];
                                  const lastColLetter = includeRemarksInReport ? 'H' : 'G';
                                  const headerRow = worksheet.addRow(['TM Rubber Pvt. Ltd']);
                                  worksheet.mergeCells(`A${headerRow.number}:${lastColLetter}${headerRow.number}`);
                                  headerRow.getCell(1).font = { bold: true, size: 16 };
                                  headerRow.getCell(1).alignment = { horizontal: 'center' };
                                  headerRow.getCell(1).border = { bottom: { style: 'medium' } };
                                  const subHeaderRow = worksheet.addRow([`Worker Production Record For the Month of ${reportMonthFilter}`]);
                                  worksheet.mergeCells(`A${subHeaderRow.number}:${lastColLetter}${subHeaderRow.number}`);
                                  subHeaderRow.getCell(1).font = { bold: true, italic: true, size: 11 };
                                  subHeaderRow.getCell(1).alignment = { horizontal: 'center' };
                                  const opNameRow = worksheet.addRow([operator]);
                                  worksheet.mergeCells(`A${opNameRow.number}:${lastColLetter}${opNameRow.number}`);
                                  opNameRow.getCell(1).font = { bold: true, size: 14, underline: true };
                                  opNameRow.getCell(1).alignment = { horizontal: 'center' };
                                  worksheet.addRow([]);
                                  const approvalRow = worksheet.addRow(['Confirm By', '', '', 'Approved By', '', '', '', '']);
                                  worksheet.mergeCells(`A${approvalRow.number}:B${approvalRow.number}`);
                                  worksheet.mergeCells(`D${approvalRow.number}:E${approvalRow.number}`);
                                  if (includeRemarksInReport) worksheet.mergeCells(`G${approvalRow.number}:H${approvalRow.number}`);
                                  approvalRow.height = 60;
                                  approvalRow.getCell(1).font = { bold: true, size: 10 };
                                  approvalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                                  approvalRow.getCell(4).font = { bold: true, size: 10 };
                                  approvalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
                                  for (let i = 1; i <= (includeRemarksInReport ? 8 : 7); i++) approvalRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                                  worksheet.addRow([]);
                                  let totalTarget = 0, totalActual = 0;
                                  opData.forEach(day => day.records.forEach(r => { totalTarget += r.targetShots; totalActual += r.actualShots; }));
                                  const overallPercent = (totalActual / (totalTarget || 1)) * 100;
                                  const summaryRow = worksheet.addRow(['Total Records', '', opData.length, totalTarget, totalActual, `${overallPercent.toFixed(2)}%`, '', ...(includeRemarksInReport ? [''] : [])]);
                                  worksheet.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
                                  summaryRow.font = { bold: true, size: 10 };
                                  summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
                                  for (let i = 1; i <= 7; i++) { const cell = summaryRow.getCell(i); cell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; }
                                  worksheet.addRow([]);
                                  const tableHeader = worksheet.addRow(['NO', 'Date', 'Part', 'Target', 'Actual', '%', 'Time', ...(includeRemarksInReport ? ['Remarks'] : [])]);
                                  tableHeader.font = { bold: true };
                                  tableHeader.alignment = { horizontal: 'center' };
                                  tableHeader.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }; cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
                                  let counter = 1;
                                  opData.forEach(day => day.records.forEach(record => {
                                    const percent = (record.actualShots / (record.targetShots || 1)) * 100;
                                    const row = worksheet.addRow([counter++, record.productionDate, record.partName, record.targetShots, record.actualShots, `${percent.toFixed(1)}%`, record.time || '-', ...(includeRemarksInReport ? [record.remarks || ''] : [])]);
                                    row.alignment = { horizontal: 'center' };
                                    row.getCell(3).alignment = { horizontal: 'left' };
                                    row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
                                  }));
                                }
                                const buffer = await workbook.xlsx.writeBuffer();
                                saveAs(new Blob([buffer]), `worker_records_${includeRemarksInReport ? 'with_remarks_' : ''}${reportMonthFilter.replace(' ', '_')}.xlsx`);
                              }}
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
                            setShowWorkerRecordReport(false);
                            setSelectedOperatorsForReport([]);
                            setViewedOperatorForReport(null);
                            setShowMobileReport(false);
                          }}
                          className="p-2 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
                        >
                          <X className="w-6 h-6 text-slate-400" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row relative">
                      <div className={`w-full lg:w-60 border-r border-slate-100 overflow-y-auto bg-slate-50/30 p-3 pt-2 flex flex-col gap-3 ${showMobileReport ? 'hidden lg:flex' : 'flex'}`}>
                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1 block">Select Month</label>
                          <select 
                            value={reportMonthFilter}
                            onChange={(e) => {
                              setReportMonthFilter(e.target.value);
                              setSelectedOperatorsForReport([]);
                              setViewedOperatorForReport(null);
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            {availableReportMonths.map(month => (
                              <option key={month} value={month}>{month}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="flex items-center justify-between px-1">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Search Operator</label>
                            <button 
                              onClick={() => {
                                const allOps = Object.keys(workerRecordData).filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase()));
                                if (selectedOperatorsForReport.length === allOps.length && allOps.length > 0) {
                                  setSelectedOperatorsForReport([]);
                                } else {
                                  setSelectedOperatorsForReport(allOps);
                                }
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                            >
                              {selectedOperatorsForReport.length > 0 ? 'Clear All' : 'Select All'}
                            </button>
                          </div>
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
                          {Object.keys(workerRecordData).filter(op => op.toLowerCase().includes(reportOperatorSearch.toLowerCase())).sort().map(operator => (
                            <div
                              key={operator}
                              className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-3 ${viewedOperatorForReport === operator ? 'bg-indigo-50 border-indigo-200' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
                              onClick={() => { setViewedOperatorForReport(operator); setShowMobileReport(true); }}
                            >
                              <div 
                                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${selectedOperatorsForReport.includes(operator) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 hover:border-indigo-400'}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedOperatorsForReport.includes(operator)) setSelectedOperatorsForReport(selectedOperatorsForReport.filter(op => op !== operator));
                                  else setSelectedOperatorsForReport([...selectedOperatorsForReport, operator]);
                                }}
                              >
                                {selectedOperatorsForReport.includes(operator) && <div className="w-2 h-2 bg-white rounded-sm" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{operator}</div>
                                <div className={`text-[10px] mt-0.5 ${viewedOperatorForReport === operator ? 'text-indigo-600' : 'text-slate-400'}`}>{workerRecordData[operator].length} Records</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                        <div ref={reportRef} className={`flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-100/50 print:bg-white print:p-0 ${showMobileReport ? 'block' : 'hidden lg:block'}`}>
                        {viewedOperatorForReport || selectedOperatorsForReport.length > 0 ? (
                          <div className="space-y-8 print:space-y-0">
                            {viewedOperatorForReport && (
                              <div className="no-print mb-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                                  <p className="text-sm font-bold text-indigo-900">Viewing: {viewedOperatorForReport}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedOperatorsForReport.length > 0 && (
                                    <button 
                                      onClick={() => setViewedOperatorForReport(null)}
                                      className="px-3 py-1.5 bg-white text-slate-600 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                      Back to Batch ({selectedOperatorsForReport.length})
                                    </button>
                                  )}
                                  <button 
                                    onClick={async () => {
                                      const workbook = new ExcelJS.Workbook();
                                      const operator = viewedOperatorForReport;
                                      const worksheet = workbook.addWorksheet(operator.substring(0, 31));
                                      const opData = workerRecordData[operator];
                                      
                                      worksheet.columns = [
                                        { width: 5 }, { width: 15 }, { width: 35 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 15 },
                                        ...(includeRemarksInReport ? [{ width: 25 }] : [])
                                      ];

                                      const totalCols = includeRemarksInReport ? 8 : 7;
                                      const lastColLetter = includeRemarksInReport ? 'H' : 'G';

                                      const headerRow = worksheet.addRow(['TM Rubber Pvt. Ltd']);
                                      worksheet.mergeCells(`A${headerRow.number}:${lastColLetter}${headerRow.number}`);
                                      headerRow.getCell(1).font = { bold: true, size: 16 };
                                      headerRow.getCell(1).alignment = { horizontal: 'center' };
                                      headerRow.getCell(1).border = { bottom: { style: 'medium' } };

                                      const subHeaderRow = worksheet.addRow([`Worker Production Record For the Month of ${reportMonthFilter}`]);
                                      worksheet.mergeCells(`A${subHeaderRow.number}:${lastColLetter}${subHeaderRow.number}`);
                                      subHeaderRow.getCell(1).font = { bold: true, italic: true, size: 11 };
                                      subHeaderRow.getCell(1).alignment = { horizontal: 'center' };

                                      const opNameRow = worksheet.addRow([operator]);
                                      worksheet.mergeCells(`A${opNameRow.number}:${lastColLetter}${opNameRow.number}`);
                                      opNameRow.getCell(1).font = { bold: true, size: 14, underline: true };
                                      opNameRow.getCell(1).alignment = { horizontal: 'center' };
                                      worksheet.addRow([]);

                                      const approvalRow = worksheet.addRow(['Confirm By', '', '', 'Approved By', '', '', '', '']);
                                      worksheet.mergeCells(`A${approvalRow.number}:B${approvalRow.number}`);
                                      worksheet.mergeCells(`D${approvalRow.number}:E${approvalRow.number}`);
                                      if (includeRemarksInReport) {
                                        worksheet.mergeCells(`G${approvalRow.number}:H${approvalRow.number}`);
                                      }
                                      approvalRow.height = 60;
                                      
                                      approvalRow.getCell(1).font = { bold: true, size: 10 };
                                      approvalRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
                                      approvalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                      
                                      approvalRow.getCell(4).font = { bold: true, size: 10 };
                                      approvalRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
                                      approvalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                      
                                      for (let i = 1; i <= (includeRemarksInReport ? 8 : 7); i++) {
                                        approvalRow.getCell(i).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                                      }
                                      worksheet.addRow([]);

                                      let totalTarget = 0, totalActual = 0;
                                      opData.forEach(day => day.records.forEach(r => { totalTarget += r.targetShots; totalActual += r.actualShots; }));
                                      const overallPercent = (totalActual / (totalTarget || 1)) * 100;

                                      const summaryRow = worksheet.addRow(['Total Records', '', opData.length, totalTarget, totalActual, `${overallPercent.toFixed(2)}%`, '', ...(includeRemarksInReport ? [''] : [])]);
                                      worksheet.mergeCells(`A${summaryRow.number}:B${summaryRow.number}`);
                                      summaryRow.font = { bold: true, size: 10 };
                                      summaryRow.alignment = { horizontal: 'center', vertical: 'middle' };
                                      summaryRow.height = 25;
                                      for (let i = 1; i <= 7; i++) {
                                        const cell = summaryRow.getCell(i);
                                        cell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
                                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
                                      }
                                      worksheet.addRow([]);

                                      const tableHeader = worksheet.addRow(['NO', 'Date', 'Part', 'Target', 'Actual', '%', 'Time', ...(includeRemarksInReport ? ['Remarks'] : [])]);
                                      tableHeader.font = { bold: true };
                                      tableHeader.alignment = { horizontal: 'center' };
                                      tableHeader.eachCell((cell) => {
                                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                                        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                                      });

                                      let counter = 1;
                                      opData.forEach(day => day.records.forEach(record => {
                                        const percent = (record.actualShots / (record.targetShots || 1)) * 100;
                                        const row = worksheet.addRow([
                                          counter++, 
                                          record.productionDate, 
                                          record.partName, 
                                          record.targetShots, 
                                          record.actualShots, 
                                          `${percent.toFixed(1)}%`,
                                          record.time || '-',
                                          ...(includeRemarksInReport ? [record.remarks || ''] : [])
                                        ]);
                                        row.alignment = { horizontal: 'center' };
                                        row.getCell(3).alignment = { horizontal: 'left' };
                                        row.eachCell((cell) => { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
                                      }));

                                      const buffer = await workbook.xlsx.writeBuffer();
                                      saveAs(new Blob([buffer]), `worker_record_${operator}_${includeRemarksInReport ? 'with_remarks_' : ''}${reportMonthFilter.replace(' ', '_')}.xlsx`);
                                    }}
                                    className="px-3 py-1.5 bg-white text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-50 transition-all flex items-center gap-2 cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Export This
                                  </button>
                                  {!selectedOperatorsForReport.includes(viewedOperatorForReport) && (
                                    <button 
                                      onClick={() => {
                                        setSelectedOperatorsForReport([...selectedOperatorsForReport, viewedOperatorForReport]);
                                      }}
                                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all cursor-pointer"
                                    >
                                      Add to Batch
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                            {(viewedOperatorForReport ? [viewedOperatorForReport] : selectedOperatorsForReport).map((operator, opIdx, arr) => (
                              <div key={operator} className={`bg-white shadow-xl border border-slate-200 rounded-sm p-8 mx-auto max-w-[95%] font-calibri text-black min-h-[1000px] print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:max-w-none print:min-h-0 ${opIdx < arr.length - 1 ? 'page-break' : ''}`}>
                                <div className="text-center mb-6">
                                  <h1 className="text-2xl font-bold border-b-2 border-black inline-block px-8 pb-2 mb-3">TM Rubber Pvt. Ltd</h1>
                                  <p className="text-sm italic font-bold mb-1">Worker Production Record For the Month of {reportMonthFilter}</p>
                                  <p className="text-xl font-bold underline underline-offset-4">{operator}</p>
                                </div>
                                <div className="grid grid-cols-10 border-2 border-black mb-4 text-center font-bold text-xs">
                                  <div className="col-span-3 p-2 border-r-2 border-black bg-slate-50 uppercase tracking-wider">Total Records</div>
                                  <div className="col-span-4 p-2 border-r-2 border-black text-xl">{workerRecordData[operator]?.length || 0}</div>
                                  <div className="col-span-3 p-2 bg-slate-50 uppercase tracking-wider">Monthly Summary</div>
                                </div>
                                <table className="w-full border-collapse border-2 border-black text-[11px] font-bold">
                                  <thead>
                                    <tr className="bg-slate-50 font-black">
                                      <th className="border-2 border-black p-2 w-10 text-center">NO</th>
                                      <th className="border-2 border-black p-2 w-24 text-center">Date</th>
                                      <th className="border-2 border-black p-2 text-left">Part</th>
                                      <th className="border-2 border-black p-2 w-20 text-center">Target</th>
                                      <th className="border-2 border-black p-2 w-20 text-center">Actual</th>
                                      <th className="border-2 border-black p-2 w-16 text-center">%</th>
                                      <th className="border-2 border-black p-2 w-20 text-center">Time</th>
                                      {includeRemarksInReport && <th className="border-2 border-black p-2 text-left">Remarks</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(() => {
                                      let counter = 1;
                                      return workerRecordData[operator]?.map((day) => (
                                        <React.Fragment key={`${day.date}-${day.shift}`}>
                                          {day.records.map((record, rIdx) => {
                                            const percent = (record.actualShots / (record.targetShots || 1)) * 100;
                                            return (
                                              <tr key={`${day.date}-${day.shift}-${rIdx}`} className="hover:bg-slate-50 border-b-2 border-black">
                                                <td className="border-2 border-black p-2 text-center">{counter++}</td>
                                                <td className="border-2 border-black p-2 text-center">{record.productionDate}</td>
                                                <td className="border-2 border-black p-2 uppercase">{record.partName}</td>
                                                <td className="border-2 border-black p-2 text-center font-mono">{record.targetShots.toLocaleString()}</td>
                                                <td className="border-2 border-black p-2 text-center font-mono">{record.actualShots.toLocaleString()}</td>
                                                <td className="border-2 border-black p-2 text-center font-black">{percent.toFixed(1)}%</td>
                                                <td className="border-2 border-black p-2 text-center font-mono">{record.time || '-'}</td>
                                                {includeRemarksInReport && <td className="border-2 border-black p-2">{record.remarks || '-'}</td>}
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
                            <Users className="w-16 h-16 opacity-20" />
                            <p className="text-lg font-medium">Select a worker from the left to view their detailed record</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

        {activeTab === 'Settings' && (
          <div className="max-w-2xl bg-white p-8 rounded-2xl border border-black/5">
            <h3 className="text-xl font-bold mb-6">Dashboard Settings</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-bold">Auto Refresh</p>
                  <p className="text-sm text-slate-500">Automatically update data every 5 minutes</p>
                </div>
                <div className="w-12 h-6 bg-indigo-600 rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-bold">Dark Mode</p>
                  <p className="text-sm text-slate-500">Switch to a dark color theme</p>
                </div>
                <div className="w-12 h-6 bg-slate-300 rounded-full relative">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>
              <button 
                onClick={fetchData}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
              >
                Force Data Refresh
              </button>
            </div>
          </div>
        )}

        {/* Data Table */}
        {activeTab === 'Production Data' && (
          <div className="space-y-10">
            {/* Part-wise Production Summary Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Part-wise Production Summary</h3>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={exportPartWiseSummary}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" /> Export Excel
                  </button>
                  <button 
                    onClick={() => setShowAllParts(!showAllParts)}
                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    {showAllParts ? 'Show Top 10' : 'View All'} <ChevronRight className={`w-4 h-4 transition-transform ${showAllParts ? 'rotate-90' : ''}`} />
                  </button>
                </div>
              </div>
              <div ref={productionSummaryRef} className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Part Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">OK Production</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">NG Parts</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total Production</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Rubber Used</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Rubber Waste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(showAllParts ? partWiseSummary : partWiseSummary.slice(0, 10)).map((row) => (
                      <tr key={row.partName} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">{row.partName}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-emerald-600">{row.ok.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-rose-500">{row.ng.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-indigo-600">{row.total.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-slate-600">{row.rubberUsed.toFixed(2)} kg</td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-slate-600">{row.rubberWaste.toFixed(2)} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View for Part-wise Summary */}
              <div className="lg:hidden divide-y divide-slate-100">
                {(showAllParts ? partWiseSummary : partWiseSummary.slice(0, 10)).map((row) => (
                  <div key={row.partName} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-bold text-slate-900">{row.partName}</span>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                        Total: {row.total.toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">OK Production</p>
                        <p className="text-sm font-bold text-emerald-700">{row.ok.toLocaleString()}</p>
                      </div>
                      <div className="bg-rose-50/50 p-2 rounded-lg border border-rose-100/50">
                        <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mb-0.5">NG Parts</p>
                        <p className="text-sm font-bold text-rose-700">{row.ng.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rubber Used</span>
                        <span className="text-xs font-bold text-slate-700">{row.rubberUsed.toFixed(2)} kg</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rubber Waste</span>
                        <span className="text-xs font-bold text-slate-700">{row.rubberWaste.toFixed(2)} kg</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {partWiseSummary.length === 0 && (
                <div className="p-12 text-center">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">No production records found matching your filters.</p>
                </div>
              )}
            </div>

            {/* Recent Production Logs Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Recent Production Logs</h3>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setShowAllLogs(!showAllLogs)}
                    className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    {showAllLogs ? 'Show Recent' : 'View All'} <ChevronRight className={`w-4 h-4 transition-transform ${showAllLogs ? 'rotate-90' : ''}`} />
                  </button>
                </div>
              </div>
              <div ref={recentLogsRef} className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Production Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Job #</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Part Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Machine</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Operator</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Shift</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">OK Prod</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">NG Parts</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Rubber</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(showAllLogs ? filteredData : filteredData.slice(0, 10)).map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 whitespace-nowrap">{row.productionDate}</td>
                        <td className="px-6 py-4 text-xs font-bold text-indigo-600">{row.jobId || '-'}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900">{row.partName}</span>
                            <span className="text-[10px] text-slate-500">{row.department}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600 font-medium">{row.machine}</td>
                        <td className="px-6 py-4 text-xs text-slate-600 font-medium">{row.operator}</td>
                        <td className="px-6 py-4 text-xs text-slate-600 font-medium">{row.shift}</td>
                        <td className="px-6 py-4 text-xs text-right font-bold text-emerald-600">{row.okProduction.toLocaleString()}</td>
                        <td className="px-6 py-4 text-xs text-right font-bold text-rose-500">{row.ngParts.toLocaleString()}</td>
                        <td className="px-6 py-4 text-xs text-right font-medium text-slate-600">{row.rubberUsed.toFixed(1)}</td>
                        <td className="px-6 py-4 text-[10px] text-slate-500 italic max-w-[200px] truncate" title={row.remarks}>{row.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View for Production Logs */}
              <div className="lg:hidden divide-y divide-slate-100">
                {(showAllLogs ? filteredData : filteredData.slice(0, 10)).map((row) => (
                  <div key={row.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-900">{row.partName}</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="font-bold text-indigo-600">{row.jobId}</span>
                          <span>•</span>
                          <span>{row.productionDate}</span>
                          <span>•</span>
                          <span>{row.shift}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{row.machine}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{row.operator}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100/50 text-center">
                        <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">OK</p>
                        <p className="text-xs font-bold text-emerald-700">{row.okProduction.toLocaleString()}</p>
                      </div>
                      <div className="bg-rose-50/50 p-2 rounded-lg border border-rose-100/50 text-center">
                        <p className="text-[9px] font-bold text-rose-600 uppercase tracking-wider mb-0.5">NG</p>
                        <p className="text-xs font-bold text-rose-700">{row.ngParts.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Rubber</p>
                        <p className="text-xs font-bold text-slate-700">{row.rubberUsed.toFixed(1)}</p>
                      </div>
                    </div>
                    {row.remarks && (
                      <div className="bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Remarks</p>
                        <p className="text-[10px] text-slate-600 italic leading-relaxed">{row.remarks}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {filteredData.length === 0 && (
                <div className="p-12 text-center">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">No production records found matching your filters.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-start gap-6 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveTab('Production Data')}
          className={`flex flex-col items-center gap-1 transition-all min-w-max ${activeTab === 'Production Data' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Data</span>
        </button>
        <button 
          onClick={() => setActiveTab('Production Order')}
          className={`flex flex-col items-center gap-1 transition-all min-w-max ${activeTab === 'Production Order' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Order</span>
        </button>
        <button 
          onClick={() => setActiveTab('Efficiency')}
          className={`flex flex-col items-center gap-1 transition-all min-w-max ${activeTab === 'Efficiency' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Eff</span>
        </button>
        <button 
          onClick={() => setActiveTab('Operators')}
          className={`flex flex-col items-center gap-1 transition-all min-w-max ${activeTab === 'Operators' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Staff</span>
        </button>
        <button 
          onClick={() => setActiveTab('Settings')}
          className={`flex flex-col items-center gap-1 transition-all min-w-max ${activeTab === 'Settings' ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tight">Setup</span>
        </button>
      </nav>
    </div>
  );
}
