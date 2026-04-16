import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notifyError } from '@shared/utils/notify';
import type { JlptAttemptSummary, JlptResultSectionBreakdown, JlptTestRef } from '@features/jlpt/types';
import { extractJlptLevel as extractCatalogLevel } from '@features/jlpt/services/jlptConfig';

const furiganaPattern = /([\p{Script=Han}\u3005\u30F6]+)[(\uFF08]([^()\uFF08\uFF09]+)[)\uFF09]/gu;

const escapeHtml = (content: string) =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const addFuriganaMarkup = (content: string | null | undefined) => {
  if (!content) {
    return '';
  }

  return escapeHtml(content)
    .replace(furiganaPattern, (_match, kanji: string, reading: string) => `<ruby>${kanji}<rt>${reading}</rt></ruby>`)
    .replace(/\n/g, '<br />');
};

interface Question {
  part: number | null;
  question_number: string | null;
  parent_question_number: string | null;
  parent_content: string;
  prompt: string;
  choices: string[];
  correct_choice_index: number | null;
  correct_choice_text: string;
  explanation: string;
  is_audio: boolean;
  audio_url: string | null;
  points_per_question?: number;
  part_index?: number;
  part_name?: string;
  part_max_score?: number;
  part_min_score?: number;
}

interface TestMeta {
  _id?: string;
  type?: string;
  level?: string;
  pass_score?: number;
  time?: number;
  parts?: Array<{
    total: number;
    name: string;
    jp_name: string;
    time?: number;
    min_score: number;
    max_score: number;
    require_audio?: boolean;
  }>;
}

interface JLPTTestRunnerProps {
  testData: Question[];
  testMeta?: TestMeta | null;
  testName: string;
  testRef?: JlptTestRef | null;
  mode?: 'exam' | 'practice';
  onComplete?: (result: JlptAttemptSummary) => void;
}

const parseNumericValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getQuestionPoints = (question: Question): number => parseNumericValue(question.points_per_question) ?? 1;

const getSectionMaxScore = (questionList: Question[]): number | undefined => {
  if (!questionList.length) {
    return undefined;
  }
  return parseNumericValue(questionList[0]?.part_max_score);
};

const scalePointsToSectionMax = (earnedPoints: number, totalPoints: number, sectionMax?: number) => {
  if (!sectionMax || totalPoints === 0) {
    return { earned: earnedPoints, total: totalPoints };
  }

  return {
    earned: (earnedPoints / totalPoints) * sectionMax,
    total: sectionMax,
  };
};

const formatPoints = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(2));
};

const sortSections = (sections: string[]) =>
  sections.sort((a, b) => {
    if (a === 'none') return 1;
    if (b === 'none') return -1;
    return Number(a) - Number(b);
  });

const extractLevel = (name: string, meta?: TestMeta | null) => {
  return extractCatalogLevel(name, meta) || 'N5';
};

const buildSectionLabel = (sectionId: string, questions: Question[], meta?: TestMeta | null) => {
  const numericSection = Number(sectionId);
  const metaPart = Number.isFinite(numericSection) ? meta?.parts?.[numericSection - 1] : null;
  if (metaPart) {
    return metaPart.jp_name ? `${metaPart.jp_name} - ${metaPart.name}` : metaPart.name;
  }

  const firstNamedQuestion = questions.find((question) => question.part_name)?.part_name;
  if (firstNamedQuestion) {
    return firstNamedQuestion;
  }

  return sectionId === 'none' ? 'Practice' : `Part ${sectionId}`;
};

const buildSectionSummary = (
  sectionId: string,
  questions: Question[],
  answers: Record<string, number>,
  skipped: Record<string, boolean>,
  meta?: TestMeta | null
): JlptResultSectionBreakdown => {
  let correct = 0;
  let answered = 0;
  let skippedCount = 0;
  let rawTotalPoints = 0;
  let rawEarnedPoints = 0;

  questions.forEach((item, index) => {
    const key = `${sectionId}-${index}`;
    const points = getQuestionPoints(item);
    rawTotalPoints += points;

    if (answers[key] !== undefined && answers[key] !== null) {
      answered += 1;
      if (answers[key] === item.correct_choice_index) {
        correct += 1;
        rawEarnedPoints += points;
      }
    } else if (skipped[key]) {
      skippedCount += 1;
    }
  });

  const scaled = scalePointsToSectionMax(rawEarnedPoints, rawTotalPoints, getSectionMaxScore(questions));
  return {
    sectionId,
    sectionLabel: buildSectionLabel(sectionId, questions, meta),
    correct,
    answered,
    total: questions.length,
    skipped: skippedCount,
    percent: questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0,
    pointsEarned: scaled.earned,
    pointsTotal: scaled.total,
  };
};

export function JLPTTestRunner({ testData, testMeta, testName, testRef = null, mode = 'practice', onComplete }: JLPTTestRunnerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const completedRef = useRef(false);
  const questionsArray = Array.isArray(testData) ? testData : [];
  const sections = useMemo(() => {
    const grouped: Record<string, Question[]> = {};
    questionsArray.forEach((question) => {
      const part = question.part !== null && question.part !== undefined ? String(question.part) : 'none';
      grouped[part] = grouped[part] || [];
      grouped[part].push(question);
    });
    return grouped;
  }, [questionsArray]);
  const sortedSections = useMemo(() => sortSections(Object.keys(sections)), [sections]);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [audioPositions, setAudioPositions] = useState<Record<string, number>>({});
  const [revealedSections, setRevealedSections] = useState<Record<string, boolean>>({});
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [showOverallResults, setShowOverallResults] = useState(false);

  useEffect(() => {
    if (!currentSection && sortedSections.length > 0) {
      setCurrentSection(sortedSections[0]);
    }
  }, [currentSection, sortedSections]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    completedRef.current = false;
  }, [mode, testName]);

  const questions = currentSection ? sections[currentSection] || [] : [];
  const question = questions[currentIndex];
  const questionKey = currentSection ? `${currentSection}-${currentIndex}` : '';
  const selectedAnswer = answers[questionKey];
  const sectionRevealed = currentSection ? revealedSections[currentSection] === true : false;
  const isSkipped = skipped[questionKey] === true;

  const saveAudioPosition = () => {
    if (audioRef.current && currentSection) {
      setAudioPositions((current) => ({
        ...current,
        [`${currentSection}-${currentIndex}`]: audioRef.current?.currentTime || 0,
      }));
    }
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeechActive(false);
    }
  };

  const moveToQuestion = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    saveAudioPosition();
    stopSpeech();
    setCurrentIndex(index);
  };

  const selectSection = (part: string) => {
    saveAudioPosition();
    stopSpeech();
    setCurrentSection(part);
    setCurrentIndex(0);
  };

  const selectAnswer = (index: number) => {
    if (sectionRevealed || !currentSection) return;
    setSkipped((current) => {
      const next = { ...current };
      delete next[questionKey];
      return next;
    });
    setAnswers((current) => ({ ...current, [questionKey]: index }));
  };

  const skipQuestion = () => {
    if (sectionRevealed || !currentSection) return;
    setSkipped((current) => ({ ...current, [questionKey]: true }));
    setAnswers((current) => {
      const next = { ...current };
      delete next[questionKey];
      return next;
    });
  };

  const revealCurrentSection = () => {
    if (!currentSection) return;
    stopSpeech();
    setRevealedSections((current) => ({ ...current, [currentSection]: true }));
    setCurrentIndex(0);
  };

  const restoreAudioPosition = (audioPlayer: HTMLAudioElement) => {
    const savedPosition = audioPositions[questionKey];
    if (!savedPosition || savedPosition <= 0) return;

    const restorePosition = () => {
      if (audioPlayer.readyState >= 2) {
        audioPlayer.currentTime = savedPosition;
      }
    };

    if (audioPlayer.readyState >= 2) {
      restorePosition();
    } else {
      audioPlayer.addEventListener('canplay', restorePosition, { once: true });
    }
  };

  const finishTest = () => {
    if (!canFinishTest) return;
    setShowOverallResults(true);
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.({
        testRef,
        testName: overallSummary.testName,
        level: overallSummary.level,
        mode,
        sections: sectionSummaries,
        overall: overallSummary,
      });
    }
  };

  const readTranscript = () => {
    if (!('speechSynthesis' in window)) {
      notifyError(t('jlptTest.runner.textToSpeechNotSupported'), { title: 'Text-to-speech' });
      return;
    }

    if (!question?.explanation) return;

    stopSpeech();

    const utterance = new SpeechSynthesisUtterance(question.explanation);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => setIsSpeechActive(false);
    utterance.onerror = () => setIsSpeechActive(false);

    setIsSpeechActive(true);
    window.speechSynthesis.speak(utterance);
  };

  const pauseTranscript = () => {
    if (!('speechSynthesis' in window)) return;

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
  };

  const sectionSummaries = useMemo(
    () => sortedSections.map((sectionId) => buildSectionSummary(sectionId, sections[sectionId] || [], answers, skipped, testMeta)),
    [answers, sections, skipped, sortedSections, testMeta]
  );

  const currentSectionSummary = currentSection
    ? sectionSummaries.find((summary) => summary.sectionId === currentSection) || null
    : null;

  const overallSummary = useMemo(() => {
    const correct = sectionSummaries.reduce((sum, section) => sum + section.correct, 0);
    const answered = sectionSummaries.reduce((sum, section) => sum + section.answered, 0);
    const total = sectionSummaries.reduce((sum, section) => sum + section.total, 0);
    const skippedCount = sectionSummaries.reduce((sum, section) => sum + section.skipped, 0);
    const pointsEarned = sectionSummaries.reduce((sum, section) => sum + section.pointsEarned, 0);
    const pointsTotal = sectionSummaries.reduce((sum, section) => sum + section.pointsTotal, 0);

    return {
      level: extractLevel(testName, testMeta),
      testRef,
      testName: testName.replace('.json', ''),
      mode,
      correct,
      answered,
      total,
      skipped: skippedCount,
      percent: total > 0 ? Math.round((correct / total) * 100) : 0,
      pointsEarned,
      pointsTotal,
    };
  }, [mode, sectionSummaries, testMeta, testName, testRef]);

  const answeredCount = Object.keys(answers).length;
  const progressPercent = overallSummary.total > 0 ? Math.round((answeredCount / overallSummary.total) * 100) : 0;
  const revealedCount = Object.values(revealedSections).filter(Boolean).length;
  const canFinishTest = sortedSections.length > 0 && sortedSections.every((sectionId) => revealedSections[sectionId]);
  const timeLabel = testMeta?.time ? `${testMeta.time} min` : null;
  const levelLabel = testMeta?.level || testMeta?.type || null;

  const choiceStateClass = (index: number) => {
    const base = 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50';
    if (!sectionRevealed) {
      return selectedAnswer === index ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900/10' : base;
    }
    if (index === question?.correct_choice_index) {
      return 'border-green-500 bg-green-50 text-green-950';
    }
    if (selectedAnswer === index) {
      return 'border-red-500 bg-red-50 text-red-950';
    }
    return 'border-gray-200 bg-white opacity-75';
  };

  if (!questionsArray.length) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-gray-600">
        {t('jlptTest.runner.loadingQuestions')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-normal text-gray-500">
            {levelLabel && <span>{levelLabel}</span>}
            {timeLabel && <span>{timeLabel}</span>}
          </div>
          <h1 className="text-2xl font-semibold text-gray-950 md:text-3xl">
            {testName.replace('.json', '')}
          </h1>
          <div className="mt-2 text-sm text-gray-500">
            {mode === 'exam' ? 'Exam simulation' : 'Practice run'}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <div className="border-l border-gray-200 pl-3">
            <div className="text-xl font-semibold text-gray-950">{answeredCount}/{overallSummary.total}</div>
            <div className="text-xs text-gray-500">{t('jlptTest.runner.answered', { defaultValue: 'Answered' })}</div>
          </div>
          <div className="border-l border-gray-200 pl-3">
            <div className="text-xl font-semibold text-gray-950">{revealedCount}/{sortedSections.length}</div>
            <div className="text-xs text-gray-500">Sections reviewed</div>
          </div>
          <div className="border-l border-gray-200 pl-3">
            <div className="text-xl font-semibold text-gray-950">{progressPercent}%</div>
            <div className="text-xs text-gray-500">{t('jlptTest.runner.progress', { defaultValue: 'Progress' })}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 lg:order-1 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-gray-950">
              {t('jlptTest.runner.sections', { defaultValue: 'Sections' })}
            </div>
            <div className="space-y-2">
              {sortedSections.map((part) => (
                <button
                  key={part}
                  onClick={() => selectSection(part)}
                  className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm font-medium transition-colors ${
                    currentSection === part
                      ? 'border-gray-950 bg-gray-950 text-white'
                      : 'border-gray-200 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0 text-left">
                    <div>{sectionSummaries.find((summary) => summary.sectionId === part)?.sectionLabel || t('jlptTest.runner.part', { part })}</div>
                    <div className={`text-xs ${currentSection === part ? 'text-gray-200' : 'text-gray-500'}`}>
                      {sectionSummaries.find((summary) => summary.sectionId === part)?.answered || 0}/{sections[part]?.length || 0} answered
                    </div>
                  </div>
                  <span className="rounded-md border border-current/20 px-2 py-1 text-xs font-semibold">
                    {revealedSections[part] ? 'Ready' : 'Open'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <label htmlFor="question-selector" className="text-sm font-semibold text-gray-950">
                {t('jlptTest.runner.jumpToQuestion')}
              </label>
              <span className="text-xs text-gray-500">{currentIndex + 1}/{questions.length}</span>
            </div>
            <select
              id="question-selector"
              value={currentIndex}
              onChange={(event) => moveToQuestion(Number(event.target.value))}
              className="mb-3 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-gray-950"
            >
              {questions.map((item, index) => {
                const qNum = item.question_number || `${index + 1}`;
                return (
                  <option key={`${qNum}-${index}`} value={index}>
                    {t('jlptTest.runner.question', { number: index + 1 })}
                    {qNum !== String(index + 1) ? ` (${qNum})` : ''}
                  </option>
                );
              })}
            </select>
            <div className="grid grid-cols-6 gap-1">
              {questions.map((item, index) => {
                const key = `${currentSection}-${index}`;
                const answered = answers[key] !== undefined;
                const skippedQuestion = skipped[key];
                const correct = sectionRevealed && answers[key] === item.correct_choice_index;
                const wrong = sectionRevealed && answered && !correct;
                const className = [
                  'flex aspect-square items-center justify-center rounded-md border text-xs font-semibold transition-colors',
                  index === currentIndex ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400',
                  answered && !sectionRevealed ? 'bg-gray-100' : '',
                  skippedQuestion && !sectionRevealed ? 'border-amber-300 bg-amber-50 text-amber-800' : '',
                  correct ? 'border-green-500 bg-green-50 text-green-800' : '',
                  wrong ? 'border-red-500 bg-red-50 text-red-800' : '',
                ].join(' ');
                return (
                  <button key={key} onClick={() => moveToQuestion(index)} className={className}>
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-gray-950">Full test</div>
            <div className="mb-3 text-sm text-gray-500">Reveal each section, then finish the test to save one result entry.</div>
            <button
              type="button"
              onClick={finishTest}
              disabled={!canFinishTest}
              className="h-10 w-full rounded-md border border-gray-950 bg-gray-950 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Finish test
            </button>
          </div>
        </aside>

        <main className="order-1 min-w-0 lg:order-2">
          {question ? (
            <section className="rounded-md border border-gray-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-500">
                    {t('jlptTest.runner.question', { number: currentIndex + 1 })}
                    {question.question_number ? ` (${question.question_number})` : ''}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {question.part !== null && (
                      <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {t('jlptTest.runner.part', { part: question.part })}
                      </span>
                    )}
                    {isSkipped && (
                      <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                        {t('jlptTest.runner.skipped')}
                      </span>
                    )}
                  </div>
                </div>
                {sectionRevealed && currentSectionSummary && currentSectionSummary.pointsTotal > 0 && (
                  <div className="text-sm font-semibold text-gray-700">
                    {formatPoints(currentSectionSummary.pointsEarned)}/{formatPoints(currentSectionSummary.pointsTotal)} {t('jlptTest.runner.points', { defaultValue: 'points' })}
                  </div>
                )}
              </div>

              <div className="space-y-5 p-5">
                {question.parent_content?.trim() && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-gray-500">
                      {question.parent_question_number
                        ? t('jlptTest.runner.readingPassageWithNumber', { number: question.parent_question_number })
                        : t('jlptTest.runner.readingPassage')}
                    </div>
                    <div
                      className="max-w-none text-base leading-7 text-gray-900"
                      dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(question.parent_content) }}
                    />
                  </div>
                )}

                <div
                  className="max-w-none text-xl leading-9 text-gray-950"
                  dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(question.prompt || t('jlptTest.runner.noPrompt')) }}
                />

                {question.is_audio && question.audio_url && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 text-sm font-semibold text-gray-800">{t('jlptTest.runner.audioQuestion')}</div>
                    <audio
                      ref={audioRef}
                      className="w-full"
                      controls
                      preload="metadata"
                      onLoadedMetadata={(event) => restoreAudioPosition(event.currentTarget)}
                      onTimeUpdate={(event) => {
                        if (!currentSection) return;
                        const currentTime = event.currentTarget.currentTime;
                        setAudioPositions((current) => ({ ...current, [questionKey]: currentTime }));
                      }}
                    >
                      <source src={question.audio_url} type="audio/mpeg" />
                      {t('jlptTest.runner.audioNotSupported')}
                    </audio>
                  </div>
                )}

                {question.choices?.length ? (
                  <div className="space-y-3">
                    {question.choices.map((choice, index) => (
                      <button
                        key={`${choice}-${index}`}
                        type="button"
                        disabled={sectionRevealed}
                        onClick={() => selectAnswer(index)}
                        className={`flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors disabled:cursor-default ${choiceStateClass(index)}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current text-sm font-semibold">
                          {index + 1}
                        </span>
                        <span
                          className="min-w-0 flex-1 text-base leading-7"
                          dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(choice || t('jlptTest.runner.choice', { number: index + 1 })) }}
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800">
                    {t('jlptTest.runner.noChoices')}
                  </div>
                )}

                {sectionRevealed && question.explanation && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 text-sm font-semibold text-gray-900">
                      {question.is_audio ? t('jlptTest.runner.transcript') : t('jlptTest.runner.explanation')}
                    </div>
                    <div
                      className="text-base leading-7 text-gray-800"
                      dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(question.explanation) }}
                    />
                    {question.is_audio && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={readTranscript}
                          className="h-10 rounded-md border border-gray-950 bg-gray-950 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSpeechActive}
                        >
                          {t('jlptTest.runner.readTranscript')}
                        </button>
                        {isSpeechActive && (
                          <button
                            onClick={pauseTranscript}
                            className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
                          >
                            {window.speechSynthesis?.paused ? t('jlptTest.runner.resume') : t('jlptTest.runner.pause')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <button
                    onClick={() => moveToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('jlptTest.runner.previous')}
                  </button>
                  <button
                    onClick={skipQuestion}
                    disabled={sectionRevealed}
                    className="h-10 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('jlptTest.runner.skip')}
                  </button>
                </div>
                <div className="flex gap-2">
                  {!sectionRevealed && currentIndex < questions.length - 1 ? (
                    <button
                      onClick={() => moveToQuestion(currentIndex + 1)}
                      className="h-10 rounded-md border border-gray-950 bg-gray-950 px-5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      {t('jlptTest.runner.next')}
                    </button>
                  ) : !sectionRevealed ? (
                    <button
                      onClick={revealCurrentSection}
                      className="h-10 rounded-md border border-green-700 bg-green-700 px-5 text-sm font-medium text-white transition-colors hover:bg-green-800"
                    >
                      Reveal section results
                    </button>
                  ) : canFinishTest ? (
                    <button
                      onClick={finishTest}
                      className="h-10 rounded-md border border-green-700 bg-green-700 px-5 text-sm font-medium text-white transition-colors hover:bg-green-800"
                    >
                      Finish test
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const nextSection = sortedSections.find((sectionId) => !revealedSections[sectionId]);
                        if (nextSection) {
                          selectSection(nextSection);
                        }
                      }}
                      className="h-10 rounded-md border border-gray-950 bg-gray-950 px-5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                    >
                      Next section
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-gray-600">
              {t('jlptTest.runner.noQuestionAvailable')}
            </div>
          )}

          {sectionRevealed && currentSectionSummary && (
            <div className="mt-6 rounded-md border border-gray-200 bg-white p-5">
              <div className="mb-3 text-lg font-semibold text-gray-950">{currentSectionSummary.sectionLabel}</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">{currentSectionSummary.correct}/{currentSectionSummary.total}</div>
                  <div className="text-sm text-gray-500">{currentSectionSummary.percent}% correct</div>
                </div>
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">{currentSectionSummary.skipped}</div>
                  <div className="text-sm text-gray-500">{t('jlptTest.runner.skipped')}</div>
                </div>
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">
                    {formatPoints(currentSectionSummary.pointsEarned)}/{formatPoints(currentSectionSummary.pointsTotal)}
                  </div>
                  <div className="text-sm text-gray-500">Points</div>
                </div>
              </div>
            </div>
          )}

          {showOverallResults && (
            <div className="mt-6 rounded-md border border-gray-200 bg-white p-5">
              <div className="mb-3 text-lg font-semibold text-gray-950">Full test results</div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">{overallSummary.percent}%</div>
                  <div className="text-sm text-gray-500">Overall percentage</div>
                </div>
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">{overallSummary.correct}/{overallSummary.total}</div>
                  <div className="text-sm text-gray-500">Correct / total</div>
                </div>
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">{overallSummary.answered}</div>
                  <div className="text-sm text-gray-500">Answered</div>
                </div>
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-2xl font-semibold text-gray-950">
                    {formatPoints(overallSummary.pointsEarned)}/{formatPoints(overallSummary.pointsTotal)}
                  </div>
                  <div className="text-sm text-gray-500">Points</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
