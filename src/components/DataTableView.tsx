import React, { useState, useMemo } from 'react';
import { GraphNode } from '../types';

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  key: string;
  direction: SortDirection;
}

export type TableRowItem = {
  type: 'node';
  data: GraphNode;
};

interface DataTableViewProps {
  items: TableRowItem[];
  onSelectionChange?: (selectedItems: TableRowItem[]) => void;
}

const DataTableView: React.FC<DataTableViewProps> = ({ items, onSelectionChange }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: null });

  const columns = useMemo(() => {
    if (items.length === 0) return [];
    
    const firstItem = items[0];
    if (firstItem.type === 'node') {
      const node = firstItem.data;
      return Object.keys(node).filter(key => key !== 'id');
    }
    
    return [];
  }, [items]);

  const sortedItems = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return items;

    return [...items].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (a.type === 'node' && b.type === 'node') {
        aVal = a.data[sortConfig.key];
        bVal = b.data[sortConfig.key];
      }

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      const comparison = aStr.localeCompare(bStr);
      
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [items, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return { key: '', direction: null };
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(sortedItems.map(item => {
        if (item.type === 'node') return item.data.id;
        return '';
      }).filter(Boolean));
      setSelectedIds(allIds);
      onSelectionChange?.(sortedItems);
    } else {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (item: TableRowItem, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    const id = item.type === 'node' ? item.data.id : '';
    
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    
    setSelectedIds(newSelected);
    const selectedItems = sortedItems.filter(i => {
      const itemId = i.type === 'node' ? i.data.id : '';
      return newSelected.has(itemId);
    });
    onSelectionChange?.(selectedItems);
  };

  const renderCellValue = (value: any): string => {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getSortIcon = (columnKey: string) => {
    if (sortConfig.key !== columnKey) {
      return <span className="text-gray-400 ml-1">⇅</span>;
    }
    return sortConfig.direction === 'asc' ? 
      <span className="ml-1">↑</span> : 
      <span className="ml-1">↓</span>;
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No items to display
      </div>
    );
  }

  const allSelected = sortedItems.length > 0 && selectedIds.size === sortedItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < sortedItems.length;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table className="min-w-full border-collapse">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="border border-gray-300 px-4 py-2 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="cursor-pointer"
              />
            </th>
            {columns.map(col => (
              <th
                key={col}
                className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 select-none"
                onClick={() => handleSort(col)}
              >
                <div className="flex items-center font-semibold">
                  {col}
                  {getSortIcon(col)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, idx) => {
            const id = item.type === 'node' ? item.data.id : `item-${idx}`;
            const isSelected = selectedIds.has(id);
            
            return (
              <tr
                key={id}
                className={`${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}
              >
                <td className="border border-gray-300 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleSelectRow(item, e.target.checked)}
                    className="cursor-pointer"
                  />
                </td>
                {columns.map(col => {
                  const value = item.type === 'node' ? item.data[col] : null;
                  return (
                    <td key={col} className="border border-gray-300 px-4 py-2">
                      {renderCellValue(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 bg-blue-100 border-t-2 border-blue-300 px-4 py-2 text-sm">
          {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
};

export default DataTableView;
