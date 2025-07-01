import React, { useState, useEffect } from 'react';
import { X, Calendar, Check, AlertCircle, Settings, Eye, EyeOff, Crown, Users, Lock } from 'lucide-react';

const CalendarSelectionModal = ({ 
    isOpen, 
    onClose, 
    availableCalendars = [], 
    selectedCalendars = [], 
    onSave, 
    isLoading = false,
    recommendations = []
}) => {
    const [selections, setSelections] = useState({});
    const [syncPreferences, setSyncPreferences] = useState({
        syncPrimaryCalendar: true,
        syncSecondaryCalendars: false,
        excludeReadOnlyCalendars: true,
        syncDirection: 'bidirectional',
        conflictResolution: 'user_choice',
        autoSelectNewCalendars: false
    });
    const [expandedCalendar, setExpandedCalendar] = useState(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    // Initialize selections from props
    useEffect(() => {
        const initialSelections = {};
        selectedCalendars.forEach(cal => {
            initialSelections[cal.calendar_id] = {
                selected: true,
                sync_direction: cal.sync_direction || 'bidirectional',
                conflict_resolution: cal.conflict_resolution || 'user_choice',
                calendar_name: cal.calendar_name,
                calendar_metadata: cal.calendar_metadata || {}
            };
        });
        setSelections(initialSelections);
    }, [selectedCalendars]);

    // Handle calendar selection toggle
    const handleCalendarToggle = (calendarId, calendarData) => {
        setSelections(prev => {
            const isCurrentlySelected = prev[calendarId]?.selected;
            
            if (isCurrentlySelected) {
                // Deselect calendar
                const { [calendarId]: removed, ...rest } = prev;
                return rest;
            } else {
                // Select calendar with default settings
                return {
                    ...prev,
                    [calendarId]: {
                        selected: true,
                        sync_direction: calendarData.readOnly ? 'fromGoogle' : 'bidirectional',
                        conflict_resolution: 'user_choice',
                        calendar_name: calendarData.summary,
                        calendar_metadata: {
                            primary: calendarData.primary,
                            accessRole: calendarData.accessRole,
                            readOnly: calendarData.readOnly,
                            colorId: calendarData.colorId,
                            timeZone: calendarData.timeZone
                        }
                    }
                };
            }
        });
    };

    // Handle individual calendar settings
    const handleCalendarSettings = (calendarId, field, value) => {
        setSelections(prev => ({
            ...prev,
            [calendarId]: {
                ...prev[calendarId],
                [field]: value
            }
        }));
    };

    // Apply recommendations
    const handleApplyRecommendations = () => {
        const recommendedSelections = {};
        recommendations.forEach(rec => {
            recommendedSelections[rec.calendar_id] = {
                selected: true,
                sync_direction: rec.sync_direction,
                conflict_resolution: rec.conflict_resolution,
                calendar_name: rec.calendar_name,
                calendar_metadata: rec.calendar_metadata
            };
        });
        setSelections(recommendedSelections);
    };

    // Handle save
    const handleSave = () => {
        const selectedCalendarsList = Object.entries(selections)
            .filter(([_, settings]) => settings.selected)
            .map(([calendarId, settings]) => ({
                calendar_id: calendarId,
                calendar_name: settings.calendar_name,
                sync_direction: settings.sync_direction,
                conflict_resolution: settings.conflict_resolution,
                sync_preferences: {},
                calendar_metadata: settings.calendar_metadata
            }));

        onSave({
            calendars: selectedCalendarsList,
            preferences: syncPreferences
        });
    };

    // Get calendar icon based on type
    const getCalendarIcon = (calendar) => {
        if (calendar.primary) return <Crown className="w-4 h-4 text-yellow-500" />;
        if (calendar.accessRole === 'owner') return <Calendar className="w-4 h-4 text-blue-500" />;
        if (calendar.accessRole === 'writer') return <Users className="w-4 h-4 text-green-500" />;
        if (calendar.readOnly) return <Lock className="w-4 h-4 text-gray-500" />;
        return <Calendar className="w-4 h-4 text-gray-400" />;
    };

    // Get calendar status badge
    const getStatusBadge = (calendar) => {
        if (calendar.primary) {
            return <span className="inline-flex px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Primary</span>;
        }
        if (calendar.accessRole === 'owner') {
            return <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">Owner</span>;
        }
        if (calendar.accessRole === 'writer') {
            return <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Editor</span>;
        }
        if (calendar.readOnly) {
            return <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Read Only</span>;
        }
        return null;
    };

    // Get recommendation badge
    const getRecommendationBadge = (calendarId) => {
        const recommendation = recommendations.find(r => r.calendar_id === calendarId);
        if (recommendation) {
            return (
                <span className="inline-flex px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                    Recommended
                </span>
            );
        }
        return null;
    };

    if (!isOpen) return null;

    const selectedCount = Object.values(selections).filter(s => s.selected).length;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">Select Calendars to Sync</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Choose which Google calendars you want to synchronize with PharmaDOC
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-200px)]">
                    {/* Recommendations Banner */}
                    {recommendations.length > 0 && (
                        <div className="p-4 bg-purple-50 border-b border-purple-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    <AlertCircle className="w-5 h-5 text-purple-600" />
                                    <span className="text-sm font-medium text-purple-900">
                                        We recommend {recommendations.length} calendars based on your setup
                                    </span>
                                </div>
                                <button
                                    onClick={handleApplyRecommendations}
                                    className="px-3 py-1 text-sm font-medium text-purple-700 bg-purple-200 rounded-md hover:bg-purple-300 transition-colors"
                                >
                                    Apply Recommendations
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Global Preferences */}
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-gray-900">Sync Preferences</h3>
                            <button
                                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                                className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700"
                            >
                                <Settings className="w-4 h-4" />
                                <span>{showAdvancedSettings ? 'Hide' : 'Show'} Advanced</span>
                            </button>
                        </div>
                        
                        {showAdvancedSettings && (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={syncPreferences.syncPrimaryCalendar}
                                            onChange={(e) => setSyncPreferences(prev => ({
                                                ...prev,
                                                syncPrimaryCalendar: e.target.checked
                                            }))}
                                            className="rounded border-gray-300"
                                        />
                                        <span className="text-sm text-gray-700">Auto-sync primary calendar</span>
                                    </label>
                                </div>
                                <div>
                                    <label className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={syncPreferences.excludeReadOnlyCalendars}
                                            onChange={(e) => setSyncPreferences(prev => ({
                                                ...prev,
                                                excludeReadOnlyCalendars: e.target.checked
                                            }))}
                                            className="rounded border-gray-300"
                                        />
                                        <span className="text-sm text-gray-700">Exclude read-only calendars</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Calendar List */}
                    <div className="p-4">
                        <div className="space-y-3">
                            {availableCalendars.map((calendar) => {
                                const isSelected = selections[calendar.id]?.selected || false;
                                const calendarSettings = selections[calendar.id] || {};

                                return (
                                    <div
                                        key={calendar.id}
                                        className={`border rounded-lg p-4 transition-all ${
                                            isSelected 
                                                ? 'border-blue-300 bg-blue-50' 
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        {/* Calendar Header */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <label className="flex items-center space-x-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleCalendarToggle(calendar.id, calendar)}
                                                        className="rounded border-gray-300"
                                                    />
                                                    <div className="flex items-center space-x-2">
                                                        {getCalendarIcon(calendar)}
                                                        <span className="font-medium text-gray-900">
                                                            {calendar.summary}
                                                        </span>
                                                    </div>
                                                </label>
                                                <div className="flex items-center space-x-2">
                                                    {getStatusBadge(calendar)}
                                                    {getRecommendationBadge(calendar.id)}
                                                </div>
                                            </div>
                                            
                                            {isSelected && (
                                                <button
                                                    onClick={() => setExpandedCalendar(
                                                        expandedCalendar === calendar.id ? null : calendar.id
                                                    )}
                                                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                >
                                                    <Settings className="w-4 h-4 text-gray-500" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Calendar Description */}
                                        {calendar.description && (
                                            <p className="text-sm text-gray-600 mt-2 ml-6">
                                                {calendar.description}
                                            </p>
                                        )}

                                        {/* Calendar Details */}
                                        <div className="flex items-center space-x-4 mt-2 ml-6 text-xs text-gray-500">
                                            <span>{calendar.timeZone}</span>
                                            {calendar.approximateEventCount !== undefined && (
                                                <span>~{calendar.approximateEventCount} events</span>
                                            )}
                                            {calendar.syncStatus?.last_sync && (
                                                <span>Last synced: {new Date(calendar.syncStatus.last_sync).toLocaleDateString()}</span>
                                            )}
                                        </div>

                                        {/* Expanded Settings */}
                                        {isSelected && expandedCalendar === calendar.id && (
                                            <div className="mt-4 p-3 bg-white rounded border border-gray-200">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Sync Direction
                                                        </label>
                                                        <select
                                                            value={calendarSettings.sync_direction || 'bidirectional'}
                                                            onChange={(e) => handleCalendarSettings(calendar.id, 'sync_direction', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            disabled={calendar.readOnly}
                                                        >
                                                            <option value="bidirectional">Two-way sync</option>
                                                            <option value="toGoogle">PharmaDOC → Google</option>
                                                            <option value="fromGoogle">Google → PharmaDOC</option>
                                                        </select>
                                                        {calendar.readOnly && (
                                                            <p className="text-xs text-yellow-600 mt-1">
                                                                Read-only calendar - only one-way sync available
                                                            </p>
                                                        )}
                                                    </div>
                                                    
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Conflict Resolution
                                                        </label>
                                                        <select
                                                            value={calendarSettings.conflict_resolution || 'user_choice'}
                                                            onChange={(e) => handleCalendarSettings(calendar.id, 'conflict_resolution', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        >
                                                            <option value="user_choice">Ask me to resolve</option>
                                                            <option value="priority_based">Priority based</option>
                                                            <option value="time_based">Time based</option>
                                                            <option value="automatic">Automatic</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Calendar Color Preview */}
                                                {calendar.backgroundColor && (
                                                    <div className="mt-3 flex items-center space-x-2">
                                                        <span className="text-sm text-gray-700">Calendar color:</span>
                                                        <div
                                                            className="w-4 h-4 rounded border border-gray-300"
                                                            style={{ backgroundColor: calendar.backgroundColor }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Empty State */}
                        {availableCalendars.length === 0 && (
                            <div className="text-center py-8">
                                <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600">No calendars available to sync</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    Make sure your Google account has calendars and the integration is properly connected.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                    <div className="text-sm text-gray-600">
                        {selectedCount} of {availableCalendars.length} calendars selected
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isLoading || selectedCount === 0}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? 'Saving...' : `Save Selection${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CalendarSelectionModal;
