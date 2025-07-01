import React, { useState, useEffect } from 'react';
import { 
    Clock, 
    Settings, 
    Save, 
    RotateCcw, 
    AlertCircle, 
    CheckCircle,
    Calendar,
    Timer,
    Zap,
    User
} from 'lucide-react';

const BufferTimeSettings = ({ 
    userId, 
    onSettingsUpdate, 
    className = '' 
}) => {
    // Default buffer settings
    const defaultSettings = {
        beforeAppointment: 15,
        afterAppointment: 15,
        enableSmartBuffering: true,
        respectCalendarBuffers: true,
        minimumBufferTime: 5,
        maximumBufferTime: 60,
        bufferTimeStrategy: 'fixed',
        adaptiveFactors: {
            appointmentDuration: true,
            appointmentType: true,
            providerPreferences: true,
            timeOfDay: true
        },
        overrideSettings: {
            allowUserOverride: true,
            allowProviderOverride: true,
            requireApproval: false
        },
        appointmentTypeOverrides: {
            consultation: { before: 10, after: 10 },
            procedure: { before: 30, after: 20 },
            surgery: { before: 60, after: 30 },
            emergency: { before: 5, after: 5 },
            'follow-up': { before: 10, after: 10 },
            telemedicine: { before: 5, after: 5 }
        }
    };

    const [settings, setSettings] = useState(defaultSettings);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [isDirty, setIsDirty] = useState(false);

    // Buffer strategies
    const bufferStrategies = [
        {
            value: 'fixed',
            label: 'Fixed Time',
            description: 'Use the same buffer time for all appointments',
            icon: Clock
        },
        {
            value: 'percentage',
            label: 'Percentage Based',
            description: 'Buffer time as a percentage of appointment duration',
            icon: Timer
        },
        {
            value: 'adaptive',
            label: 'Adaptive',
            description: 'Automatically adjust based on appointment factors',
            icon: Zap
        },
        {
            value: 'dynamic',
            label: 'Dynamic',
            description: 'AI-powered buffer calculation based on patterns',
            icon: Settings
        }
    ];

    // Appointment types for override settings
    const appointmentTypes = [
        { key: 'consultation', label: 'Consultation', icon: User },
        { key: 'procedure', label: 'Procedure', icon: Settings },
        { key: 'surgery', label: 'Surgery', icon: AlertCircle },
        { key: 'emergency', label: 'Emergency', icon: AlertCircle },
        { key: 'follow-up', label: 'Follow-up', icon: Calendar },
        { key: 'telemedicine', label: 'Telemedicine', icon: Timer }
    ];

    useEffect(() => {
        loadUserSettings();
    }, [userId]);

    const loadUserSettings = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/users/${userId}/preferences`);
            const data = await response.json();
            
            if (data.success && data.preferences?.buffer_time_settings) {
                setSettings({
                    ...defaultSettings,
                    ...data.preferences.buffer_time_settings
                });
            }
        } catch (error) {
            console.error('Error loading buffer settings:', error);
            setMessage({
                type: 'error',
                text: 'Failed to load buffer time settings'
            });
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        try {
            setSaving(true);
            
            const response = await fetch(`/api/users/${userId}/preferences`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buffer_time_settings: settings
                })
            });

            const data = await response.json();

            if (data.success) {
                setMessage({
                    type: 'success',
                    text: 'Buffer time settings saved successfully'
                });
                setIsDirty(false);
                onSettingsUpdate?.(settings);
            } else {
                throw new Error(data.error || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving buffer settings:', error);
            setMessage({
                type: 'error',
                text: 'Failed to save buffer time settings'
            });
        } finally {
            setSaving(false);
        }
    };

    const resetToDefaults = () => {
        setSettings(defaultSettings);
        setIsDirty(true);
        setMessage({
            type: 'info',
            text: 'Settings reset to defaults. Click Save to apply changes.'
        });
    };

    const updateSettings = (path, value) => {
        setSettings(prev => {
            const newSettings = { ...prev };
            const keys = path.split('.');
            let current = newSettings;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!current[keys[i]]) current[keys[i]] = {};
                current = current[keys[i]];
            }
            
            current[keys[keys.length - 1]] = value;
            return newSettings;
        });
        setIsDirty(true);
    };

    const updateAppointmentTypeOverride = (type, field, value) => {
        setSettings(prev => ({
            ...prev,
            appointmentTypeOverrides: {
                ...prev.appointmentTypeOverrides,
                [type]: {
                    ...prev.appointmentTypeOverrides[type],
                    [field]: parseInt(value) || 0
                }
            }
        }));
        setIsDirty(true);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2">Loading buffer time settings...</span>
            </div>
        );
    }

    return (
        <div className={`bg-white rounded-lg shadow-lg ${className}`}>
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <Clock className="h-6 w-6 text-blue-600" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Buffer Time Settings
                            </h3>
                            <p className="text-sm text-gray-600">
                                Configure automatic buffer times between appointments
                            </p>
                        </div>
                    </div>
                    <div className="flex space-x-2">
                        <button
                            onClick={resetToDefaults}
                            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                            disabled={saving}
                        >
                            <RotateCcw className="h-4 w-4 mr-1 inline" />
                            Reset
                        </button>
                        <button
                            onClick={saveSettings}
                            disabled={!isDirty || saving}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {saving ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-8">
                {/* Message */}
                {message && (
                    <div className={`p-4 rounded-md ${
                        message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                        message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                        'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                        <div className="flex items-center">
                            {message.type === 'error' ? <AlertCircle className="h-5 w-5 mr-2" /> :
                             message.type === 'success' ? <CheckCircle className="h-5 w-5 mr-2" /> :
                             <AlertCircle className="h-5 w-5 mr-2" />}
                            {message.text}
                        </div>
                    </div>
                )}

                {/* Basic Buffer Settings */}
                <div className="space-y-6">
                    <h4 className="text-lg font-medium text-gray-900">Basic Buffer Settings</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Before Appointment (minutes)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="120"
                                value={settings.beforeAppointment}
                                onChange={(e) => updateSettings('beforeAppointment', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                After Appointment (minutes)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="120"
                                value={settings.afterAppointment}
                                onChange={(e) => updateSettings('afterAppointment', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Minimum Buffer Time (minutes)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="30"
                                value={settings.minimumBufferTime}
                                onChange={(e) => updateSettings('minimumBufferTime', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Maximum Buffer Time (minutes)
                            </label>
                            <input
                                type="number"
                                min="30"
                                max="240"
                                value={settings.maximumBufferTime}
                                onChange={(e) => updateSettings('maximumBufferTime', parseInt(e.target.value) || 30)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Buffer Strategy */}
                <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">Buffer Strategy</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {bufferStrategies.map((strategy) => {
                            const IconComponent = strategy.icon;
                            return (
                                <div
                                    key={strategy.value}
                                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                                        settings.bufferTimeStrategy === strategy.value
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                    onClick={() => updateSettings('bufferTimeStrategy', strategy.value)}
                                >
                                    <div className="flex items-start space-x-3">
                                        <div className={`p-2 rounded-lg ${
                                            settings.bufferTimeStrategy === strategy.value
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 text-gray-600'
                                        }`}>
                                            <IconComponent className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1">
                                            <h5 className="font-medium text-gray-900">{strategy.label}</h5>
                                            <p className="text-sm text-gray-600 mt-1">{strategy.description}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Smart Buffer Options */}
                <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">Smart Buffer Options</h4>
                    <div className="space-y-3">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={settings.enableSmartBuffering}
                                onChange={(e) => updateSettings('enableSmartBuffering', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-sm text-gray-700">
                                Enable smart buffering based on appointment patterns
                            </span>
                        </label>
                        
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={settings.respectCalendarBuffers}
                                onChange={(e) => updateSettings('respectCalendarBuffers', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-sm text-gray-700">
                                Respect existing calendar buffer times
                            </span>
                        </label>
                    </div>
                </div>

                {/* Adaptive Factors (shown only for adaptive/dynamic strategies) */}
                {(settings.bufferTimeStrategy === 'adaptive' || settings.bufferTimeStrategy === 'dynamic') && (
                    <div className="space-y-4">
                        <h4 className="text-lg font-medium text-gray-900">Adaptive Factors</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.adaptiveFactors.appointmentDuration}
                                    onChange={(e) => updateSettings('adaptiveFactors.appointmentDuration', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-700">Appointment Duration</span>
                            </label>
                            
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.adaptiveFactors.appointmentType}
                                    onChange={(e) => updateSettings('adaptiveFactors.appointmentType', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-700">Appointment Type</span>
                            </label>
                            
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.adaptiveFactors.providerPreferences}
                                    onChange={(e) => updateSettings('adaptiveFactors.providerPreferences', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-700">Provider Preferences</span>
                            </label>
                            
                            <label className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={settings.adaptiveFactors.timeOfDay}
                                    onChange={(e) => updateSettings('adaptiveFactors.timeOfDay', e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-3 text-sm text-gray-700">Time of Day</span>
                            </label>
                        </div>
                    </div>
                )}

                {/* Appointment Type Overrides */}
                <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">Appointment Type Overrides</h4>
                    <div className="space-y-4">
                        {appointmentTypes.map((type) => {
                            const IconComponent = type.icon;
                            const override = settings.appointmentTypeOverrides[type.key] || { before: 0, after: 0 };
                            
                            return (
                                <div key={type.key} className="border border-gray-200 rounded-lg p-4">
                                    <div className="flex items-center space-x-3 mb-3">
                                        <IconComponent className="h-5 w-5 text-gray-600" />
                                        <span className="font-medium text-gray-900">{type.label}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">Before (min)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="120"
                                                value={override.before}
                                                onChange={(e) => updateAppointmentTypeOverride(type.key, 'before', e.target.value)}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-gray-600 mb-1">After (min)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="120"
                                                value={override.after}
                                                onChange={(e) => updateAppointmentTypeOverride(type.key, 'after', e.target.value)}
                                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Override Settings */}
                <div className="space-y-4">
                    <h4 className="text-lg font-medium text-gray-900">Override Settings</h4>
                    <div className="space-y-3">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={settings.overrideSettings.allowUserOverride}
                                onChange={(e) => updateSettings('overrideSettings.allowUserOverride', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-sm text-gray-700">
                                Allow users to override buffer times when scheduling
                            </span>
                        </label>
                        
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={settings.overrideSettings.allowProviderOverride}
                                onChange={(e) => updateSettings('overrideSettings.allowProviderOverride', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-sm text-gray-700">
                                Allow providers to set their own buffer time preferences
                            </span>
                        </label>
                        
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={settings.overrideSettings.requireApproval}
                                onChange={(e) => updateSettings('overrideSettings.requireApproval', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-3 text-sm text-gray-700">
                                Require approval for buffer time override requests
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BufferTimeSettings; 