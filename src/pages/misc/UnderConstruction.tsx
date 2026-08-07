import { useState } from 'react'
import clsx from 'clsx'
import { Layout } from '@/components/layout/Layout'
import { UnderConstruction } from '@/components/common/UnderConstruction'

export function TransactionDeskPage() {
  return (
    <Layout title="TransactionDesk">
      <UnderConstruction
        title="TransactionDesk — Coming Soon"
        description="Digital forms, e-signatures, and full transaction workflow management are being built. This module will integrate with NY DOS disclosure requirements and NAR standards."
        eta="Q3 2024"
      />
    </Layout>
  )
}

export function ListingManagerPage() {
  return (
    <Layout title="Listing Manager">
      <UnderConstruction
        title="Listing Manager — Coming Soon"
        description="Create, publish, and manage new property listings directly from your workspace. Integration with REBNY and OneKey MLS coming soon."
        eta="Q3 2024"
      />
    </Layout>
  )
}

export function MarketingHubPage() {
  return (
    <Layout title="Marketing Hub">
      <UnderConstruction
        title="Marketing Hub — Coming Soon"
        description="Email campaigns, social media scheduling, and digital marketing tools are under development."
        eta="Q4 2024"
      />
    </Layout>
  )
}

export function BrokerCoursePage() {
  const [activeQuestion, setActiveQuestion] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [showResult, setShowResult] = useState(false)
  const [answered, setAnswered] = useState(false)

  const practiceQuestions = [
    {
      q: "Under New York Real Property Law Article 12-A, what is the penalty for practicing real estate without a license?",
      options: [
        "A misdemeanor, punishable by a fine of up to $1,000 and/or imprisonment up to one year",
        "A civil infraction with a warning letter",
        "A felony, carrying a minimum of two years in state prison",
        "A fine of $250 payable directly to the Department of State"
      ],
      answer: 0,
      explanation: "Section 442-e of the RPL states that any person violating Article 12-A is guilty of a misdemeanor, subject to a fine of up to $1,000 and/or imprisonment of up to one year."
    },
    {
      q: "Which New York state regulatory body is responsible for licensing real estate salespeople and brokers?",
      options: [
        "Division of Human Rights (DHR)",
        "Department of State (DOS) Division of Licensing Services",
        "New York State Association of REALTORS (NYSAR)",
        "Department of Financial Services (DFS)"
      ],
      answer: 1,
      explanation: "The NYS Department of State (DOS) Division of Licensing Services regulates and licenses real estate practitioners."
    },
    {
      q: "According to RPL §443, when must a licensee provide the written Agency Disclosure Form to a client?",
      options: [
        "At the time of formal contract signing",
        "Prior to closing of the transaction",
        "At first substantive contact with the consumer",
        "Within 3 business days of listing creation"
      ],
      answer: 2,
      explanation: "NY State Law mandates that licensees present the agency disclosure form at the 'first substantive contact' before exchanging confidential details."
    }
  ]

  const handleSelectOption = (idx: number) => {
    if (answered) return
    setSelectedOption(idx)
  }

  const handleAnswerSubmit = () => {
    if (selectedOption === null || answered) return
    setAnswered(true)
    if (selectedOption === practiceQuestions[activeQuestion].answer) {
      setScore(prev => prev + 1)
    }
  }

  const handleNext = () => {
    setAnswered(false)
    setSelectedOption(null)
    if (activeQuestion + 1 < practiceQuestions.length) {
      setActiveQuestion(prev => prev + 1)
    } else {
      setShowResult(true)
    }
  }

  const handleRestart = () => {
    setActiveQuestion(0)
    setSelectedOption(null)
    setScore(0)
    setAnswered(false)
    setShowResult(false)
  }

  return (
    <Layout title="Broker License Training">
      <div className="space-y-6 max-w-4xl">
        {/* Header banner */}
        <div className="bg-indigo-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
          <div className="relative z-10 max-w-lg space-y-2">
            <span className="text-xs font-bold bg-amber-400 text-indigo-900 px-3 py-1 rounded-full uppercase tracking-wide">NY Article 12-A Prep</span>
            <h2 className="text-2xl font-black">Broker Licensing Study Portal</h2>
            <p className="text-indigo-200 text-xs">Access exam study manuals, NY State regulatory guidelines, and interactive multiple-choice test prep widgets.</p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 font-black text-9xl select-none leading-none translate-x-12 translate-y-12">DOS</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Practice exam prep widget */}
          <div className="md:col-span-2 bg-white rounded-3xl border border-gray-200 p-6 shadow-sm flex flex-col space-y-4">
            <h3 className="font-bold text-gray-900 text-sm">Interactive Exam Prep Simulator</h3>

            {showResult ? (
              <div className="bg-emerald-50 rounded-2xl p-6 text-center space-y-3 border border-emerald-100 flex-1 flex flex-col justify-center items-center">
                <p className="text-3xl font-black text-emerald-800">{Math.round((score / practiceQuestions.length) * 100)}% Score</p>
                <p className="text-xs text-gray-600 font-medium">You answered {score} out of {practiceQuestions.length} questions correctly.</p>
                <button
                  onClick={handleRestart}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Restart Practice Test
                </button>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase mb-2">
                    <span>Question {activeQuestion + 1} of {practiceQuestions.length}</span>
                    <span>Score: {score}</span>
                  </div>
                  <p className="font-semibold text-gray-800 text-sm mb-4 leading-snug">{practiceQuestions[activeQuestion].q}</p>

                  <div className="space-y-2">
                    {practiceQuestions[activeQuestion].options.map((opt, idx) => {
                      const isSelected = selectedOption === idx
                      const isCorrect = idx === practiceQuestions[activeQuestion].answer
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectOption(idx)}
                          className={clsx(
                            "w-full text-left p-3 rounded-xl border text-xs font-medium transition-all",
                            answered
                              ? isCorrect
                                ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold"
                                : isSelected
                                  ? "bg-red-50 border-red-300 text-red-800 font-bold"
                                  : "border-gray-100 opacity-60 bg-gray-50/50"
                              : isSelected
                                ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-500/20"
                                : "border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {answered && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-[11px] text-indigo-900">
                    <p className="font-bold">Explanation:</p>
                    <p className="mt-0.5 leading-relaxed">{practiceQuestions[activeQuestion].explanation}</p>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100 flex justify-end">
                  {!answered ? (
                    <button
                      onClick={handleAnswerSubmit}
                      disabled={selectedOption === null}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 transition-colors shadow-sm"
                    >
                      Submit Answer
                    </button>
                  ) : (
                    <button
                      onClick={handleNext}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm"
                    >
                      {activeQuestion + 1 < practiceQuestions.length ? 'Next Question →' : 'Finish Practice Exam'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick resources and files */}
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm space-y-3">
              <h4 className="font-bold text-gray-900 text-xs">Official Manuals & Resources</h4>
              <div className="space-y-2 text-xs">
                {[
                  { name: "NY DOS Article 12-A Law Book", desc: "Official state real estate law statutes", link: "https://www.dos.ny.gov/licensing/lawbooks/RE-Law.pdf" },
                  { name: "Fair Housing Regulatory Manual", desc: "NY Fair Housing rules & procedures", link: "https://www.dos.ny.gov/licensing/re_salesperson/fair_housing.html" },
                  { name: "NAR Code of Ethics (2026)", desc: "National ethical rules of conduct", link: "https://www.nar.realtor/about-nar/governing-documents/code-of-ethics" }
                ].map((doc) => (
                  <a
                    key={doc.name}
                    href={doc.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded-2xl bg-gray-50 hover:bg-gray-100/80 border border-gray-100 transition-colors group"
                  >
                    <p className="font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">{doc.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{doc.desc}</p>
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-5 text-xs text-indigo-950 space-y-2">
              <h4 className="font-bold">Broker License Requirements:</h4>
              <ul className="list-disc pl-4 space-y-1 text-indigo-900 text-[11px]">
                <li>At least 20 years of age</li>
                <li>2 years of experience as salesperson (3,000 points verified)</li>
                <li>Complete 152-hour broker education course</li>
                <li>Pass written DOS broker examination</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
