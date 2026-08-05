import React from 'react';

interface CategoryCardProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (cat: string) => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({ categories, selectedCategory, onSelect }) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            selectedCategory === cat
              ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/30'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
};
