import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { jlptTestService, TestFile } from '../services/jlptTestService';
import { JLPTTestRunner } from '../components/JLPTTestRunner';

export function JLPTTestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTest, setSelectedTest] = useState<TestFile | null>(null);
  const [testData, setTestData] = useState<{ questions: any[]; meta?: any } | null>(null);
  const [loadingTest, setLoadingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      setError(null);
      const availableTests = await jlptTestService.getAllTests();
      setTests(availableTests);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('jlptTest.page.failedToLoadTests'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTest = async (test: TestFile) => {
    try {
      setLoadingTest(true);
      setError(null);
      const data = await jlptTestService.loadTestData(test);
      setTestData(data);
      setSelectedTest(test);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('jlptTest.page.failedToLoadTest'));
    } finally {
      setLoadingTest(false);
    }
  };

  const handleBack = () => {
    setSelectedTest(null);
    setTestData(null);
  };

  if (selectedTest && testData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-purple-700 p-5">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleBack}
            className="mb-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {t('jlptTest.page.backToSelection')}
          </button>
          <JLPTTestRunner testData={testData.questions} testMeta={testData.meta} testName={selectedTest.name.replace('.json', '')} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-purple-700 p-5">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
          {t('jlptTest.page.title')}
        </h1>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('jlptTest.page.loadingTests')}</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
            <p className="text-red-700">{error}</p>
            <button
              onClick={loadTests}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              {t('jlptTest.page.retry')}
            </button>
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              {t('jlptTest.page.noTestsFound')}
            </h2>
            <p className="text-gray-500 mb-6">
              {t('jlptTest.page.noTestsDescription')}
            </p>
            <p className="text-sm text-gray-400">
              {t('jlptTest.page.noTestsHint')}
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-700 mb-4">
                {t('jlptTest.page.selectTest')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tests.map((test) => (
                  <button
                    key={`${test.source}-${test.id}`}
                    onClick={() => handleSelectTest(test)}
                    disabled={loadingTest}
                    className="p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-purple-600 hover:bg-purple-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-800">
                        {test.name.replace('.json', '')}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          test.source === 'library'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {test.source === 'library' ? t('jlptTest.page.library') : t('jlptTest.page.local')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {test.source === 'library'
                        ? t('jlptTest.page.fromLibrary')
                        : t('jlptTest.page.fromLocal')}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {loadingTest && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                <p className="text-gray-600">{t('jlptTest.page.loadingTest')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

