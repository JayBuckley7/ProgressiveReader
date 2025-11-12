import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const furiganaPattern = /((?:[\p{sc=Han}々〆ヶ]+)|\(\)|（）)\(([^)]+)\)/gu;

const addFuriganaMarkup = (content: string | null | undefined) => {
  if (!content) {
    return '';
  }

  return content.replace(furiganaPattern, (_match, kanji: string, reading: string) => {
    // Handle empty parentheses case - if kanji is empty parentheses, use empty string
    const kanjiText = kanji === '()' || kanji === '（）' ? '' : kanji;
    return `<ruby>${kanjiText}<rt>${reading}</rt></ruby>`;
  });
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
}

export function JLPTTestRunner({ testData, testMeta, testName }: JLPTTestRunnerProps) {
  const { t } = useTranslation();
  // Ensure testData is always an array
  const questionsArray = Array.isArray(testData) ? testData : [];
  const [allQuestions] = useState<Question[]>(questionsArray);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [audioPositions, setAudioPositions] = useState<Record<string, number>>({});
  const [showAnswers, setShowAnswers] = useState(false);
  const [sections, setSections] = useState<Record<string, Question[]>>({});
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (allQuestions.length === 0) return;

    // Group questions by part/section
    const grouped: Record<string, Question[]> = {};
    allQuestions.forEach(q => {
      const part = q.part !== null && q.part !== undefined ? String(q.part) : 'none';
      if (!grouped[part]) {
        grouped[part] = [];
      }
      grouped[part].push(q);
    });
    setSections(grouped);

    // Default to first section - set state directly to avoid race condition
    const firstSection = Object.keys(grouped).sort((a, b) => {
      if (a === 'none') return 1;
      if (b === 'none') return -1;
      return parseInt(a) - parseInt(b);
    })[0];

    if (firstSection && grouped[firstSection] && grouped[firstSection].length > 0) {
      setCurrentSection(firstSection);
      setQuestions(grouped[firstSection]);
      setCurrentIndex(0);
      setShowAnswers(false);
    }
  }, [allQuestions]);

  const selectSection = (part: string) => {
    saveAudioPosition();
    stopSpeech();
    setCurrentSection(part);
    setQuestions(sections[part] || []);
    setCurrentIndex(0);
    setShowAnswers(false);
  };

  const getQuestionKey = (part: string, index: number) => `${part}-${index}`;

  const selectAnswer = (index: number) => {
    if (showAnswers) return;
    const questionKey = getQuestionKey(currentSection!, currentIndex);
    const newSkipped = { ...skipped };
    delete newSkipped[questionKey];
    setSkipped(newSkipped);
    setAnswers({ ...answers, [questionKey]: index });
  };

  const skipQuestion = () => {
    if (showAnswers) return;
    const questionKey = getQuestionKey(currentSection!, currentIndex);
    setSkipped({ ...skipped, [questionKey]: true });
    const newAnswers = { ...answers };
    delete newAnswers[questionKey];
    setAnswers(newAnswers);
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      saveAudioPosition();
      stopSpeech();
      setCurrentIndex(currentIndex + 1);
    }
  };

  const previousQuestion = () => {
    if (currentIndex > 0) {
      saveAudioPosition();
      stopSpeech();
      setCurrentIndex(currentIndex - 1);
    }
  };

  const jumpToQuestion = (index: number) => {
    if (index >= 0 && index < questions.length) {
      saveAudioPosition();
      stopSpeech();
      setCurrentIndex(index);
    }
  };

  const saveAudioPosition = () => {
    const audioPlayer = document.querySelector('.audio-player') as HTMLAudioElement;
    if (audioPlayer && currentSection) {
      const questionKey = getQuestionKey(currentSection, currentIndex);
      setAudioPositions({ ...audioPositions, [questionKey]: audioPlayer.currentTime });
    }
  };

  const restoreAudioPosition = (audioPlayer: HTMLAudioElement, questionKey: string) => {
    const savedPosition = audioPositions[questionKey];
    if (savedPosition !== undefined && savedPosition !== null && savedPosition > 0) {
      const restorePosition = () => {
        if (audioPlayer.readyState >= 2) {
          audioPlayer.currentTime = savedPosition;
        }
      };

      if (audioPlayer.readyState >= 2) {
        restorePosition();
      } else {
        audioPlayer.addEventListener('canplaythrough', restorePosition, { once: true });
        audioPlayer.addEventListener('canplay', () => {
          setTimeout(restorePosition, 100);
        }, { once: true });
      }

      audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.currentTime > 0) {
          setAudioPositions({ ...audioPositions, [questionKey]: audioPlayer.currentTime });
        }
      });
    }
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setCurrentUtterance(null);
    }
  };

  const readTranscript = () => {
    if (!('speechSynthesis' in window)) {
      alert(t('jlptTest.runner.textToSpeechNotSupported'));
      return;
    }

    const question = questions[currentIndex];
    if (!question.explanation) return;

    stopSpeech();

    const utterance = new SpeechSynthesisUtterance(question.explanation);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => setCurrentUtterance(null);
    utterance.onerror = () => setCurrentUtterance(null);

    setCurrentUtterance(utterance);
    window.speechSynthesis.speak(utterance);
  };

  const pauseTranscript = () => {
    if (!('speechSynthesis' in window)) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  };

  const showResults = () => {
    setShowAnswers(true);
    setCurrentIndex(0);
  };

  const updateScore = () => {
    let correct = 0;
    let answered = 0;
    let totalPoints = 0;
    let earnedPoints = 0;
    
    questions.forEach((q, index) => {
      const questionKey = getQuestionKey(currentSection!, index);
      const points = q.points_per_question ?? 1; // Default to 1 point if not specified
      
      if (answers[questionKey] !== undefined && answers[questionKey] !== null) {
        answered++;
        totalPoints += points;
        if (answers[questionKey] === q.correct_choice_index) {
          correct++;
          earnedPoints += points;
        }
      }
    });
    return { correct, answered, totalPoints, earnedPoints };
  };

  const getQuestionStatus = (index: number) => {
    const questionKey = getQuestionKey(currentSection!, index);
    if (answers[questionKey] !== undefined && answers[questionKey] !== null) {
      const q = questions[index];
      const isCorrect = answers[questionKey] === q.correct_choice_index;
      return isCorrect ? ` ${t('jlptTest.runner.correct')}` : ` ${t('jlptTest.runner.incorrect')}`;
    } else if (skipped[questionKey]) {
      return ` ${t('jlptTest.runner.skippedLabel')}`;
    }
    return '';
  };

  const { correct, answered, totalPoints, earnedPoints } = updateScore();
  const pointsPercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const question = questions[currentIndex];
  const questionKey = currentSection ? getQuestionKey(currentSection, currentIndex) : '';
  const selectedAnswer = answers[questionKey];
  const isAnswered = selectedAnswer !== undefined && selectedAnswer !== null;
  const isSkipped = skipped[questionKey] === true;

  // Debug logging
  useEffect(() => {
    if (question) {
      console.log('Current question:', question);
      console.log('Choices:', question.choices);
    }
  }, [question]);

  const sortedSections = Object.keys(sections).sort((a, b) => {
    if (a === 'none') return 1;
    if (b === 'none') return -1;
    return parseInt(a) - parseInt(b);
  });

  // Calculate final results with per-question scoring
  let finalCorrect = 0;
  let finalAnswered = 0;
  let skippedCount = 0;
  let finalTotalPoints = 0;
  let finalEarnedPoints = 0;
  
  questions.forEach((q, index) => {
    const qKey = getQuestionKey(currentSection!, index);
    const points = q.points_per_question ?? 1; // Default to 1 point if not specified
    
    if (answers[qKey] !== undefined && answers[qKey] !== null) {
      finalAnswered++;
      finalTotalPoints += points;
      if (answers[qKey] === q.correct_choice_index) {
        finalCorrect++;
        finalEarnedPoints += points;
      }
    } else if (skipped[qKey]) {
      skippedCount++;
    }
  });
  
  const percentage = finalAnswered > 0 ? Math.round((finalCorrect / finalAnswered) * 100) : 0;
  const pointsPercentage = finalTotalPoints > 0 ? Math.round((finalEarnedPoints / finalTotalPoints) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl p-8">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
        {t('jlptTest.runner.title', { testName })}
      </h1>

        {/* Section Selector */}
        <div className="flex flex-wrap gap-2 justify-center mb-6 p-4 bg-gray-100 rounded-lg">
          {sortedSections.map(part => (
            <button
              key={part}
              onClick={() => selectSection(part)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                currentSection === part
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-purple-600 border-2 border-purple-600 hover:bg-purple-50'
              }`}
            >
              {t('jlptTest.runner.part', { part })} ({t('jlptTest.runner.questions', { count: sections[part]?.length || 0 })})
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="flex justify-around mb-6 p-4 bg-gray-100 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{currentIndex + 1}</div>
            <div className="text-xs text-gray-600">{t('jlptTest.runner.currentQuestion')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{questions.length}</div>
            <div className="text-xs text-gray-600">{t('jlptTest.runner.totalQuestions')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {answered > 0 ? `${correct}/${answered}` : '0/0'}
            </div>
            <div className="text-xs text-gray-600">{t('jlptTest.runner.score')}</div>
            {totalPoints > 0 && (
              <>
                <div className="text-lg font-semibold text-purple-500 mt-1">
                  {earnedPoints}/{totalPoints} {t('jlptTest.runner.points', { defaultValue: 'points' })}
                </div>
                <div className="text-xs text-gray-500">
                  {pointsPercentage}%
                </div>
              </>
            )}
          </div>
        </div>

        {/* Question Selector */}
        <div className="flex items-center gap-2 justify-center mb-4 p-2 bg-gray-50 rounded-lg">
          <label htmlFor="question-selector" className="font-semibold text-gray-700 text-sm">
            {t('jlptTest.runner.jumpToQuestion')}
          </label>
          <select
            id="question-selector"
            value={currentIndex}
            onChange={(e) => jumpToQuestion(parseInt(e.target.value))}
            className="px-3 py-2 border-2 border-purple-600 rounded-lg text-sm bg-white text-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-[150px]"
          >
            {questions.map((q, index) => {
              const qNum = q.question_number || `${index + 1}`;
              const status = getQuestionStatus(index);
              return (
                <option key={index} value={index}>
                  {t('jlptTest.runner.question', { number: index + 1 })}{qNum !== String(index + 1) ? ` (${qNum})` : ''}{status}
                </option>
              );
            })}
          </select>
        </div>

        {/* Question Area */}
        {question && questions.length > 0 ? (
          <div className="mb-6 p-6 bg-gray-50 rounded-lg border-l-4 border-purple-600">
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-purple-600 text-lg">
                {t('jlptTest.runner.question', { number: currentIndex + 1 })} {question.question_number ? `(${question.question_number})` : ''}
              </span>
              <div className="flex gap-2">
                {question.part !== null && (
                  <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs">
                    {t('jlptTest.runner.part', { part: question.part })}
                  </span>
                )}
                {isSkipped && (
                  <span className="bg-orange-500 text-white px-3 py-1 rounded-full text-xs">
                    {t('jlptTest.runner.skipped')}
                  </span>
                )}
              </div>
            </div>

            {/* Parent Content */}
            {question.parent_content && question.parent_content.trim() && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                <div className="font-bold text-blue-700 text-xs uppercase mb-2">
                  {question.parent_question_number
                    ? t('jlptTest.runner.readingPassageWithNumber', { number: question.parent_question_number })
                    : t('jlptTest.runner.readingPassage')}
                </div>
                <div
                  className="text-base leading-relaxed text-gray-800"
                  dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(question.parent_content) }}
                />
              </div>
            )}

            {/* Prompt */}
            <div
              className="mb-4 text-lg leading-relaxed text-gray-800"
              dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(question.prompt || t('jlptTest.runner.noPrompt')) }}
            />

            {/* Audio Player */}
            {question.is_audio && question.audio_url && (
              <div className="mb-4 p-4 bg-purple-50 rounded-lg border-l-4 border-purple-600">
                <div className="font-bold mb-2 text-purple-600">{t('jlptTest.runner.audioQuestion')}</div>
                <audio
                  className="audio-player w-full"
                  controls
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const audio = e.currentTarget;
                    if (currentSection) {
                      restoreAudioPosition(audio, getQuestionKey(currentSection, currentIndex));
                    }
                  }}
                >
                  <source src={question.audio_url} type="audio/mpeg" />
                  {t('jlptTest.runner.audioNotSupported')}
                </audio>
              </div>
            )}

            {/* Choices */}
            {question.choices && question.choices.length > 0 ? (
              <ul className="list-none space-y-2 my-4">
                {question.choices.map((choice, index) => {
                  let classes = 'p-4 bg-white border-2 rounded-lg cursor-pointer transition-all';
                  if (selectedAnswer === index) {
                    classes += ' border-purple-600 bg-purple-50';
                  }
                  if (isAnswered || showAnswers) {
                    if (index === question.correct_choice_index) {
                      classes += ' border-green-500 bg-green-50';
                    } else if (selectedAnswer === index && index !== question.correct_choice_index) {
                      classes += ' border-red-500 bg-red-50';
                    }
                  } else {
                    classes += ' border-gray-300 hover:border-purple-600 hover:bg-purple-50';
                  }

                  // Check if choice contains HTML tags
                  const formattedChoice = addFuriganaMarkup(choice);
                  const hasHTML = /<[a-z][\s\S]*>/i.test(formattedChoice);

                  return (
                    <li
                      key={index}
                      className={classes}
                      onClick={() => selectAnswer(index)}
                    >
                      <label className="cursor-pointer flex items-center w-full">
                        <input
                          type="radio"
                          name="answer"
                          value={index}
                          checked={selectedAnswer === index}
                          disabled={isAnswered || showAnswers}
                          onChange={() => selectAnswer(index)}
                          className="mr-2 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {hasHTML ? (
                          <span className="flex-1 text-gray-800" dangerouslySetInnerHTML={{ __html: formattedChoice }} />
                        ) : (
                          <span className="flex-1 text-gray-800">{formattedChoice || t('jlptTest.runner.choice', { number: index + 1 })}</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="my-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-lg">
                <p className="text-yellow-700">{t('jlptTest.runner.noChoices')}</p>
              </div>
            )}

            {/* Explanation */}
            {(isAnswered && question.explanation) || (showAnswers && question.explanation) ? (
              <div className="mt-4 p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-500">
                <div className="font-bold mb-2 text-yellow-700">
                  {question.is_audio ? t('jlptTest.runner.transcript') : t('jlptTest.runner.explanation')}
                </div>
                <div className="text-gray-800" dangerouslySetInnerHTML={{ __html: addFuriganaMarkup(question.explanation) }} />
                {question.is_audio && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={readTranscript}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      disabled={window.speechSynthesis?.speaking}
                    >
                      {t('jlptTest.runner.readTranscript')}
                    </button>
                    {window.speechSynthesis?.speaking && (
                      <button
                        onClick={pauseTranscript}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition-colors"
                      >
                        {window.speechSynthesis.paused ? t('jlptTest.runner.resume') : t('jlptTest.runner.pause')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : questions.length === 0 ? (
          <div className="mb-6 p-6 bg-gray-50 rounded-lg border-l-4 border-purple-600">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-600">{t('jlptTest.runner.loadingQuestions')}</p>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-6 bg-gray-50 rounded-lg border-l-4 border-purple-600">
            <div className="text-center py-8">
              <p className="text-gray-600">{t('jlptTest.runner.noQuestionAvailable')}</p>
            </div>
          </div>
        )}

        {/* Controls */}
        {question && questions.length > 0 && (
          <div className="flex justify-between gap-2 mb-6">
            <div className="flex gap-2">
              <button
                onClick={previousQuestion}
                disabled={currentIndex === 0}
                className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
              >
                {t('jlptTest.runner.previous')}
              </button>
              <button
                onClick={skipQuestion}
                disabled={showAnswers}
                className="px-6 py-3 bg-orange-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-orange-600"
              >
                {t('jlptTest.runner.skip')}
              </button>
            </div>
            <div className="flex gap-2">
              {currentIndex < questions.length - 1 ? (
                <button
                  onClick={nextQuestion}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium transition-all hover:bg-purple-700"
                >
                  {t('jlptTest.runner.next')}
                </button>
              ) : (
                <button
                  onClick={showResults}
                  className="px-6 py-3 bg-green-500 text-white rounded-lg font-medium transition-all hover:bg-green-600"
                >
                  {t('jlptTest.runner.showResults')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {showAnswers && (
          <div className="mt-6 p-6 bg-gray-100 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">{t('jlptTest.runner.testResults')}</h2>
            <div className="text-center text-4xl font-bold text-purple-600 my-6">
              {t('jlptTest.runner.partResults', { part: currentSection, correct: finalCorrect, answered: finalAnswered, percentage })}
              {skippedCount > 0 ? ` | ${t('jlptTest.runner.skippedCount', { count: skippedCount })}` : ''}
            </div>
            {finalTotalPoints > 0 && (
              <div className="text-center text-2xl font-semibold text-purple-500 my-4">
                {finalEarnedPoints}/{finalTotalPoints} {t('jlptTest.runner.points', { defaultValue: 'points' })} ({pointsPercentage}%)
              </div>
            )}
          </div>
        )}
      </div>
  );
}

