import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Plus, Minus, Lock } from 'lucide-react';
import { BusinessTarget, MonthlyData } from '../types';
import { cn, formatFY, formatNumber, formatNumber2Dec } from '../lib/utils';

const parseNumber = (val: string): number => {
  const clean = val.replace(/[^\d]/g, '');
  return clean ? parseInt(clean, 10) : 0;
};

const formatInputValue = (val: number): string => {
  if (val === 0) return '';
  return formatNumber(val);
};

interface AmountInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
}

function AmountInput({ value, onChange, className, placeholder }: AmountInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState('');

  const displayValue = isFocused
    ? localValue
    : (value === 0 ? '' : formatNumber2Dec(value));

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(value === 0 ? '' : value.toString());
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(localValue) || 0;
    onChange(parsed);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let text = e.target.value;
    text = text.replace(/[^\d.]/g, '');
    const parts = text.split('.');
    if (parts.length > 2) {
      text = parts[0] + '.' + parts.slice(1).join('');
    }
    setLocalValue(text);
  };

  return (
    <input
      type="text"
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
    />
  );
}

interface DataEntryFormProps {
  isOpen: boolean;
  onClose: () => void;
  data: BusinessTarget;
  onSave: (newData: BusinessTarget) => void;
}

export default function DataEntryForm({ isOpen, onClose, data, onSave }: DataEntryFormProps) {
  const [formData, setFormData] = useState<BusinessTarget>({ ...data });

  const handleOverallChange = (field: 'overallTargetAce' | 'overallTargetCases' | 'overallTargetAcs', value: number) => {
    let newAce = formData.overallTargetAce;
    let newCases = formData.overallTargetCases;
    let newAcs = formData.overallTargetAcs;

    if (field === 'overallTargetAcs') {
      newAcs = value;
      newCases = newAcs > 0 ? Math.round(newAce / newAcs) : 0;
    } else if (field === 'overallTargetAce') {
      newAce = value;
      newCases = newAcs > 0 ? Math.round(newAce / newAcs) : 0;
    } else if (field === 'overallTargetCases') {
      newCases = value;
      newAce = newCases * newAcs;
    }

    // Distribute equally to monthly breakdown
    const monthlyAce = parseFloat((newAce / 12).toFixed(2));
    const monthlyCases = newAcs > 0 ? Math.round(monthlyAce / newAcs) : 0;
    
    const updatedMonthly = formData.monthlyBreakdown.map(m => ({
      ...m,
      targetAce: monthlyAce,
      targetCases: monthlyCases,
    }));

    setFormData({
      ...formData,
      overallTargetAce: newAce,
      overallTargetCases: newCases,
      overallTargetAcs: newAcs,
      monthlyBreakdown: updatedMonthly
    });
  };

  const handleMonthlyChange = (index: number, field: keyof MonthlyData, value: number) => {
    const updatedMonthly = [...formData.monthlyBreakdown];
    const current = updatedMonthly[index];
    
    let newMonthData = { ...current, [field]: value };

    if (field === 'targetAce') {
      newMonthData.targetCases = formData.overallTargetAcs > 0 ? Math.round(value / formData.overallTargetAcs) : 0;
    }

    if (field === 'achievedAce' || field === 'cases') {
      newMonthData.averageCaseSize = newMonthData.cases > 0 ? Math.round(newMonthData.achievedAce / newMonthData.cases) : 0;
    }

    updatedMonthly[index] = newMonthData;
    
    setFormData({
      ...formData,
      monthlyBreakdown: updatedMonthly
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <header className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Kemaskini Data Sasaran</h2>
              <p className="text-sm text-slate-500">Tahun Kewangan {formatFY(formData.year)} (April - Mac)</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            >
              <X className="w-6 h-6" />
            </button>
          </header>

          <div className="flex-grow overflow-y-auto p-8 space-y-10">
            <section>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Tempoh
                  </h3>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tahun Mula</label>
                    <input 
                      type="number"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Target ACE
                  </h3>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Total ACE (RM)</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={formatInputValue(formData.overallTargetAce)}
                      onChange={(e) => handleOverallChange('overallTargetAce', parseNumber(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Contoh: 120,000"
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Target ACS
                  </h3>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Target ACS (RM)</label>
                    <input 
                      type="text" 
                      inputMode="numeric"
                      value={formatInputValue(formData.overallTargetAcs)}
                      onChange={(e) => handleOverallChange('overallTargetAcs', parseNumber(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Contoh: 2,500"
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    Target Kes (Dikunci)
                  </h3>
                  <div className="bg-slate-100/75 p-4 rounded-2xl border border-slate-200 select-none">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Jumlah Kes</span>
                      <Lock className="w-3 h-3 text-slate-400" />
                    </label>
                    <input 
                      type="text" 
                      readOnly
                      disabled
                      value={formatNumber(formData.overallTargetCases)}
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-lg font-bold text-slate-400 cursor-not-allowed outline-none"
                      placeholder="Contoh: 48"
                    />
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest italic text-center">
                * Mengubah nilai di atas akan membahagi sasaran secara rata ke semua bulan.
              </p>
            </section>

            <section>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Pecahan Bulanan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.monthlyBreakdown.map((month, idx) => (
                  <div key={month.month} className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 text-[10px] font-black text-slate-100 group-hover:text-emerald-50 transition-colors uppercase select-none">
                      Month {idx + 1}
                    </div>
                    <div className="mb-4">
                      <span className="text-sm font-black text-slate-800 uppercase tracking-wider">{month.month}</span>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Target ACE</label>
                          <AmountInput 
                            value={month.targetAce}
                            onChange={(val) => handleMonthlyChange(idx, 'targetAce', val)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-emerald-500 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Pencapaian ACE</label>
                          <AmountInput 
                            value={month.achievedAce}
                            onChange={(val) => handleMonthlyChange(idx, 'achievedAce', val)}
                            className="w-full bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-sm font-bold text-emerald-700 outline-none focus:bg-white focus:border-emerald-500 transition-all"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                            <span>Target Kes</span>
                            <Lock className="w-3 h-3 text-slate-300 pointer-events-none" />
                          </label>
                          <div className="flex items-center bg-slate-100/55 border border-slate-200/60 rounded-lg p-1 h-[38px] select-none">
                            <input 
                              type="text" 
                              readOnly
                              disabled
                              value={formatNumber(month.targetCases)}
                              className="w-full bg-transparent text-center text-sm font-bold text-slate-400 cursor-not-allowed outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bilangan Kes</label>
                          <div className="flex items-center bg-emerald-50 border border-emerald-100 rounded-lg p-1">
                            <button 
                              onClick={() => handleMonthlyChange(idx, 'cases', Math.max(0, month.cases - 1))}
                              className="p-1 hover:bg-white rounded transition-colors"
                            >
                              <Minus className="w-3 h-3 text-emerald-600" />
                            </button>
                            <input 
                              type="number" 
                              value={month.cases}
                              onChange={(e) => handleMonthlyChange(idx, 'cases', Number(e.target.value))}
                              className="w-full bg-transparent text-center text-sm font-bold text-emerald-700 outline-none"
                            />
                            <button 
                              onClick={() => handleMonthlyChange(idx, 'cases', month.cases + 1)}
                              className="p-1 hover:bg-white rounded transition-colors"
                            >
                              <Plus className="w-3 h-3 text-emerald-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Purata Saiz Sebenar (ACS)</label>
                          <input 
                            type="text" 
                            readOnly
                            value={formatNumber2Dec(month.cases > 0 ? month.achievedAce / month.cases : 0)}
                            className="w-full bg-slate-100 border border-transparent rounded-lg px-3 py-2 text-sm font-bold text-slate-400 cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <footer className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200 transition-colors uppercase tracking-wider"
            >
              Batal
            </button>
            <button 
              onClick={() => {
                onSave({
                  ...formData,
                  monthlyBreakdown: formData.monthlyBreakdown.map(m => ({
                    ...m,
                    averageCaseSize: m.cases > 0 ? parseFloat((m.achievedAce / m.cases).toFixed(2)) : 0
                  }))
                });
                onClose();
              }}
              className="px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 flex items-center gap-2 uppercase tracking-wider"
            >
              <Save className="w-4 h-4" />
              Simpan Data
            </button>
          </footer>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
