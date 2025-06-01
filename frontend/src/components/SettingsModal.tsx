import { useSettings } from "../contexts/SettingsContext";
import { useState, useEffect } from "react";

interface SettingsModalProps {
    onClose: () => void;
    onTranslate: (useCefr: boolean) => void;
    translating: boolean;
}

export function SettingsModal({ onClose, onTranslate, translating }: SettingsModalProps) {
    const { settings, updateSettings } = useSettings();
    const [activeTab, setActiveTab] = useState<"translate" | "jlpt" | "accessibility">("translate");

    const [openaiKey, setOpenaiKey] = useState(localStorage.getItem("openaiKey") || "");
    const [openaiModel, setOpenaiModel] = useState(localStorage.getItem("openaiModel") || "gpt-4o-mini");
    const [cefrLevel, setCefrLevel] = useState(parseInt(localStorage.getItem("cefrLevel") || "3"));
    const [autoload, setAutoload] = useState(localStorage.getItem("autoloadTranslations") === "true");

    useEffect(() => { localStorage.setItem("openaiKey", openaiKey); }, [openaiKey]);
    useEffect(() => { localStorage.setItem("openaiModel", openaiModel); }, [openaiModel]);
    useEffect(() => { localStorage.setItem("cefrLevel", cefrLevel.toString()); }, [cefrLevel]);
    useEffect(() => { localStorage.setItem("autoloadTranslations", autoload.toString()); }, [autoload]);

    if (!settings) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button className={`px-3 py-1 rounded ${activeTab === 'translate' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setActiveTab('translate')}>Translate</button>
                        <button className={`px-3 py-1 rounded ${activeTab === 'jlpt' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setActiveTab('jlpt')}>JLPT</button>
                        <button className={`px-3 py-1 rounded ${activeTab === 'accessibility' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`} onClick={() => setActiveTab('accessibility')}>Accessibility</button>
                    </div>

                    {activeTab === 'translate' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">OpenAI API Key</label>
                                <input value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Model</label>
                                <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} className="w-full p-2 border rounded">
                                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                                    <option value="gpt-4">GPT-4</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5-Turbo</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Target Language</label>
                                <select value={settings.targetLanguage} onChange={(e) => updateSettings({ targetLanguage: e.target.value })} className="w-full p-2 border rounded">
                                    <option value="English">English</option>
                                    <option value="Spanish">Spanish</option>
                                    <option value="French">French</option>
                                    <option value="German">German</option>
                                    <option value="Japanese">Japanese</option>
                                    <option value="Korean">Korean</option>
                                    <option value="Chinese">Chinese</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">CEFR Level: {cefrLevel}</label>
                                <input type="range" min="0" max="5" value={cefrLevel} onChange={(e) => setCefrLevel(parseInt(e.target.value))} className="w-full" />
                            </div>
                            <div className="flex items-center">
                                <input type="checkbox" id="autoload" checked={autoload} onChange={(e) => setAutoload(e.target.checked)} className="mr-2" />
                                <label htmlFor="autoload" className="text-sm">Autoload Translations</label>
                            </div>
                        </div>
                    )}

                    {activeTab === 'jlpt' && (
                        <div className="space-y-4">
                            <div className="flex items-center">
                                <input type="checkbox" id="jlpt-enabled" checked={settings.jlptEnabled} onChange={(e) => updateSettings({ jlptEnabled: e.target.checked })} className="mr-2" />
                                <label htmlFor="jlpt-enabled" className="text-sm">Enable JLPT highlighting</label>
                            </div>
                        </div>
                    )}

                    {activeTab === 'accessibility' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Theme</label>
                                <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as any })} className="w-full p-2 border rounded">
                                    <option value="system">System Default</option>
                                    <option value="light">Light</option>
                                    <option value="dark">Dark</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Font Size: {settings.fontSize}px</label>
                                <input type="range" min="12" max="24" value={settings.fontSize} onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })} className="w-full" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Font Family</label>
                                <select value={settings.fontFamily} onChange={(e) => updateSettings({ fontFamily: e.target.value })} className="w-full p-2 border rounded">
                                    <option value="Inter">Inter</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Times New Roman">Times New Roman</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Helvetica">Helvetica</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <hr className="my-4" />
                    <div className="flex justify-between">
                        <button onClick={() => onTranslate(false)} disabled={translating} className="px-4 py-2 bg-primary text-white rounded-md">
                            {translating ? 'Translating...' : 'Translate'}
                        </button>
                        <button onClick={() => onTranslate(true)} disabled={translating} className="px-4 py-2 bg-primary text-white rounded-md">
                            {translating ? 'Translating...' : 'Translate (CEFR)'}
                        </button>
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
