
import React from 'react';

interface MonthSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const MonthSelector: React.FC<MonthSelectorProps> = ({ value, onChange }) => {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const date = new Date(value + 'T00:00:00');
  const year = date.getFullYear();

  const handlePrev = () => {
    const newDate = new Date(value + 'T00:00:00');
    newDate.setMonth(newDate.getMonth() - 1);
    onChange(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-01`);
  };

  const handleNext = () => {
    const newDate = new Date(value + 'T00:00:00');
    newDate.setMonth(newDate.getMonth() + 1);
    onChange(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-01`);
  };

  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
      <button 
        onClick={handlePrev}
        className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-slate-500 hover:text-indigo-600"
      >
        <i className="fa-solid fa-chevron-left text-xs"></i>
      </button>
      <div className="px-2 font-medium text-sm min-w-[140px] text-center text-slate-700">
        {months[date.getMonth()]} {year}
      </div>
      <button 
        onClick={handleNext}
        className="p-1.5 hover:bg-white hover:shadow-sm rounded transition-all text-slate-500 hover:text-indigo-600"
      >
        <i className="fa-solid fa-chevron-right text-xs"></i>
      </button>
    </div>
  );
};

export default MonthSelector;
