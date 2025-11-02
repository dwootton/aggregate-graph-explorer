import React, { useState } from 'react';

const CollapsibleSection = ({ title, isOpen, onToggle, children }) => (
  <div className="border border-gray-200 rounded-lg">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors"
    >
      <span className="font-medium text-gray-900">{title}</span>
      <svg
        className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    {isOpen && (
      <div className="p-3 border-t border-gray-200">
        {children}
      </div>
    )}
  </div>
);

const SettingsPanel = ({ onClose, settings, onSettingsChange }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [openSections, setOpenSections] = useState({
    presets: true,
    colors: false,
    display: false
  });

  // Color palette presets
  const colorPresets = {
    default: {
      name: 'Default',
      nodeColor: '#10B981', // Emerald green
      edgeColor: '#7C3AED', // Purple
      nodeTypeColors: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'],
      edgeTypeColors: ['#7C3AED', '#EC4899', '#F97316', '#84CC16', '#6366F1', '#14B8A6']
    },
    ocean: {
      name: 'Ocean',
      nodeColor: '#0EA5E9', // Sky blue
      edgeColor: '#0369A1', // Blue
      nodeTypeColors: ['#0EA5E9', '#0284C7', '#0369A1', '#075985', '#0C4A6E', '#082F49'],
      edgeTypeColors: ['#0369A1', '#075985', '#0C4A6E', '#164E63', '#155E75', '#0F766E']
    },
    sunset: {
      name: 'Sunset',
      nodeColor: '#F97316', // Orange
      edgeColor: '#DC2626', // Red
      nodeTypeColors: ['#F97316', '#EA580C', '#DC2626', '#B91C1C', '#991B1B', '#7F1D1D'],
      edgeTypeColors: ['#DC2626', '#B91C1C', '#991B1B', '#7F1D1D', '#450A0A', '#350808']
    },
    forest: {
      name: 'Forest',
      nodeColor: '#059669', // Emerald
      edgeColor: '#065F46', // Emerald dark
      nodeTypeColors: ['#059669', '#047857', '#065F46', '#064E3B', '#022C22', '#021E18'],
      edgeTypeColors: ['#065F46', '#064E3B', '#022C22', '#052E16', '#365314', '#4D7C0F']
    },
    monochrome: {
      name: 'Monochrome',
      nodeColor: '#374151', // Gray
      edgeColor: '#1F2937', // Gray dark
      nodeTypeColors: ['#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'],
      edgeTypeColors: ['#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF', '#D1D5DB']
    }
  };

  const toggleSection = (section) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handlePresetChange = (presetKey) => {
    const preset = colorPresets[presetKey];
    setLocalSettings(prev => ({
      ...prev,
      colorPalette: presetKey,
      nodeColor: preset.nodeColor,
      edgeColor: preset.edgeColor,
      nodeTypeColors: preset.nodeTypeColors,
      edgeTypeColors: preset.edgeTypeColors
    }));
  };

  const handleColorChange = (type, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [type]: value,
      colorPalette: 'custom' // Set to custom when manually changing colors
    }));
  };

  const handleArrayColorChange = (arrayType, index, value) => {
    setLocalSettings(prev => ({
      ...prev,
      [arrayType]: prev[arrayType].map((color, i) => i === index ? value : color),
      colorPalette: 'custom'
    }));
  };

  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const handleReset = () => {
    const defaultPreset = colorPresets.default;
    setLocalSettings({
      colorPalette: 'default',
      nodeColor: defaultPreset.nodeColor,
      edgeColor: defaultPreset.edgeColor,
      nodeTypeColors: defaultPreset.nodeTypeColors,
      edgeTypeColors: defaultPreset.edgeTypeColors,
      showConnectors: true,
      animateTransitions: true
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Color Palette Presets */}
          <CollapsibleSection
            title="Color Presets"
            isOpen={openSections.presets}
            onToggle={() => toggleSection('presets')}
          >
            <div className="space-y-2">
              {Object.entries(colorPresets).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handlePresetChange(key)}
                  className={`w-full p-2 border rounded text-left transition-all ${
                    localSettings.colorPalette === key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{preset.name}</span>
                    <div className="flex gap-1">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: preset.nodeColor }}
                        title="Node color"
                      />
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: preset.edgeColor }}
                        title="Edge color"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {preset.nodeTypeColors.slice(0, 6).map((color, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          {/* Custom Colors */}
          <CollapsibleSection
            title="Custom Colors"
            isOpen={openSections.colors}
            onToggle={() => toggleSection('colors')}
          >
            <div className="space-y-4">
              {/* Primary Colors */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Node Color</label>
                  <input
                    type="color"
                    value={localSettings.nodeColor}
                    onChange={(e) => handleColorChange('nodeColor', e.target.value)}
                    className="w-8 h-6 border border-gray-300 rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Edge Color</label>
                  <input
                    type="color"
                    value={localSettings.edgeColor}
                    onChange={(e) => handleColorChange('edgeColor', e.target.value)}
                    className="w-8 h-6 border border-gray-300 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Node Type Colors */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Node Type Colors</label>
                <div className="grid grid-cols-3 gap-1">
                  {localSettings.nodeTypeColors.map((color, index) => (
                    <input
                      key={index}
                      type="color"
                      value={color}
                      onChange={(e) => handleArrayColorChange('nodeTypeColors', index, e.target.value)}
                      className="w-full h-6 border border-gray-300 rounded cursor-pointer"
                    />
                  ))}
                </div>
              </div>

              {/* Edge Type Colors */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Edge Type Colors</label>
                <div className="grid grid-cols-3 gap-1">
                  {localSettings.edgeTypeColors.map((color, index) => (
                    <input
                      key={index}
                      type="color"
                      value={color}
                      onChange={(e) => handleArrayColorChange('edgeTypeColors', index, e.target.value)}
                      className="w-full h-6 border border-gray-300 rounded cursor-pointer"
                    />
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Display Options */}
          <CollapsibleSection
            title="Display Options"
            isOpen={openSections.display}
            onToggle={() => toggleSection('display')}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Show Connectors</label>
                <input
                  type="checkbox"
                  checked={localSettings.showConnectors}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, showConnectors: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Animate Transitions</label>
                <input
                  type="checkbox"
                  checked={localSettings.animateTransitions}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, animateTransitions: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel; 