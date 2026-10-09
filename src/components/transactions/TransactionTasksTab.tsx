import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import {
  Plus, CheckCircle2, Circle, MoreHorizontal, Trash2, FileText, Upload, Check, X,
  SlidersHorizontal, CheckSquare
} from 'lucide-react'
import clsx from 'clsx'
import confetti from 'canvas-confetti'
import { CreateTaskModal } from './CreateTaskModal'

export function TransactionTasksTab() {
  const { user } = useAuth()
  const {
    data,
    availableTemplates,
    applyTemplate,
    handleCreateTask,
    toggleTask,
    handleUploadTaskDocWithProgress,
    handleDeleteTaskDoc,
    handleUpdateTaskApproval,
    handleDeleteTask
  } = useTransactionDetail()

  const { transaction: tx, tasks = [] } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)

  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [taskMenuOpen, setTaskMenuOpen] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalDefaultGroup, setModalDefaultGroup] = useState('')
  const [modalDefaultTitle, setModalDefaultTitle] = useState('')

  // Quick inline add state
  const [quickAddGroup, setQuickAddGroup] = useState<string | null>(null)
  const [quickAddTitle, setQuickAddTitle] = useState('')
  const [isQuickAdding, setIsQuickAdding] = useState(false)

  const compatibleTemplates = availableTemplates.filter((t) => t.type === tx.type)
  const existingGroupNames = Array.from(
    new Set(tasks.map((t: any) => t.group_name).filter(Boolean))
  ) as string[]

  const handleOpenModal = (group = '', title = '') => {
    setModalDefaultGroup(group)
    setModalDefaultTitle(title)
    setIsModalOpen(true)
  }

  const handleQuickAddSubmit = async (groupName: string) => {
    if (!quickAddTitle.trim() || isQuickAdding) return
    setIsQuickAdding(true)
    const success = await handleCreateTask({
      title: quickAddTitle.trim(),
      attachment_required: false,
      broker_approval_required: false,
      group_name: groupName === 'Ungrouped Tasks' ? null : groupName,
      due_date: null
    })
    if (success) {
      setQuickAddTitle('')
      setQuickAddGroup(null)
    }
    setIsQuickAdding(false)
  }

  const handleUploadFile = async (taskId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadProgress(prev => ({ ...prev, [taskId]: 0 }))
    await handleUploadTaskDocWithProgress(taskId, file, (pct) => {
      setUploadProgress(prev => ({ ...prev, [taskId]: pct }))
    })
    setUploadProgress(prev => {
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }

  const onToggleTask = async (taskId: string, currentStatus: string) => {
    await toggleTask(taskId, currentStatus)
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    if (nextStatus === 'completed') {
      const task = tasks.find((t: any) => t.id === taskId)
      const groupTasks = tasks.filter((t: any) => t.group_name === task.group_name)
      const allOthersCompleted = groupTasks.filter((t: any) => t.id !== taskId).every((t: any) => t.status === 'completed')
      if (allOthersCompleted && groupTasks.length > 0) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
      }
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 overflow-hidden">
        <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div>
            <h3 className="font-semibold text-gray-900">Compliance & Tasks Journey</h3>
            <p className="text-xs text-gray-500">Track deal milestones, requirements, and compliance files</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="text-xs sm:text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700 focus:border-blue-500 outline-none"
            >
              <option value="">Select template...</option>
              {compatibleTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={() => selectedTemplateId && applyTemplate(selectedTemplateId, true)}
              disabled={!selectedTemplateId}
              className="text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              Apply Template
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="text-xs sm:text-sm font-medium text-white bg-blue-600 px-3.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          </div>
        </div>

        <div className="text-center py-16 px-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <CheckSquare className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900">No journey tasks assigned</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
            Get started by applying a standard compliance template or adding custom tasks to this deal.
          </p>
          <div className="mt-5 flex justify-center gap-2.5">
            <button
              onClick={() => handleOpenModal()}
              className="text-xs font-medium text-white bg-blue-600 px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="h-4 w-4" /> Add First Task
            </button>
          </div>
        </div>

        <CreateTaskModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          existingGroups={existingGroupNames}
          defaultGroup={modalDefaultGroup}
          defaultTitle={modalDefaultTitle}
          onCreateTask={handleCreateTask}
        />
      </div>
    )
  }

  const groups = Array.from(new Set(tasks.map((t: any) => t.group_name || 'Ungrouped Tasks')))

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header Toolbar */}
      <div className="border-b border-gray-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 no-print">
        <div>
          <h3 className="font-semibold text-gray-900">Compliance & Tasks Journey</h3>
          <p className="text-xs text-gray-500">Track deal milestones, requirements, and compliance files</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="text-xs sm:text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700 focus:border-blue-500 outline-none"
          >
            <option value="">Select template...</option>
            {compatibleTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={() => selectedTemplateId && applyTemplate(selectedTemplateId, true)}
            disabled={!selectedTemplateId}
            className="text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            Apply Template
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="text-xs sm:text-sm font-medium text-white bg-blue-600 px-3.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="h-4 w-4" /> Add Task
          </button>
        </div>
      </div>

      <div className="hidden print:block px-6 py-3 bg-gray-100 font-bold text-sm">
        Compliance Checklist Status
      </div>

      {/* Task Groups */}
      <div className="flex flex-col gap-6 p-6">
        {groups.map(groupName => {
          const groupTasks = tasks.filter((t: any) => (t.group_name || 'Ungrouped Tasks') === groupName)
          const completedTasks = groupTasks.filter((t: any) => t.status === 'completed')
          const progress = Math.round((completedTasks.length / groupTasks.length) * 100)
          const isQuickAddingHere = quickAddGroup === groupName

          return (
            <div key={groupName as string} className="bg-white rounded-xl border border-gray-200/80 shadow-xs overflow-hidden">
              {/* Group Header */}
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60 flex flex-col gap-2.5">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm text-gray-900">{groupName as string}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{progress}%</span>
                    <button
                      onClick={() => handleOpenModal(groupName === 'Ungrouped Tasks' ? '' : groupName as string)}
                      className="p-1 text-gray-400 hover:text-blue-600 rounded-md hover:bg-white transition-colors no-print"
                      title="Add task with full options"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-gray-200/80 rounded-full h-1.5">
                  <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                {progress === 100 && (
                  <p className="text-emerald-600 text-xs font-semibold animate-pulse flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> All tasks completed successfully!
                  </p>
                )}
              </div>

              {/* Task Items */}
              <ul className="divide-y divide-gray-100">
                {groupTasks.map((task: any) => (
                  <li key={task.id} className="px-6 py-3.5 hover:bg-gray-50/40 transition-colors">
                    <div className="flex items-start gap-4 justify-between">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => onToggleTask(task.id, task.status)}
                          className="text-gray-300 hover:text-blue-600 transition-colors mt-0.5 no-print"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <div>
                          <p className={clsx(
                            "text-sm font-medium",
                            task.status === 'completed' ? "text-gray-400 line-through" : "text-gray-900"
                          )}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <button
                            onClick={() => setTaskMenuOpen(prev => prev === task.id ? null : task.id)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 no-print"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {taskMenuOpen === task.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 w-32 overflow-hidden">
                              <button
                                onClick={() => { setTaskMenuOpen(null); handleDeleteTask(task.id) }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                        {task.due_date ? (
                          <span className="text-xs text-gray-400 whitespace-nowrap">Due: {task.due_date}</span>
                        ) : (
                          <span className="text-xs text-amber-600 whitespace-nowrap font-medium">Due: TBD</span>
                        )}

                        {task.document_key ? (
                          <span className={clsx(
                            "text-xs font-semibold px-2 py-0.5 rounded-full capitalize",
                            task.approval_status === 'approved' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                            task.approval_status === 'rejected' ? "bg-red-50 text-red-700 border border-red-200" :
                            "bg-amber-50 text-amber-700 border border-amber-200"
                          )}>
                            {task.approval_status === 'approved' ? 'Compliance OK' : task.approval_status === 'rejected' ? 'Rejected' : 'Pending Review'}
                          </span>
                        ) : (
                          <span className={clsx(
                            "text-[10px] italic",
                            task.document_required ? "text-red-600 font-semibold" : "text-gray-400"
                          )}>
                            {task.document_required ? 'Document Required' : 'Document Optional'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 pl-8 flex flex-col gap-2">
                      {task.document_key ? (
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <a
                              href={`/api/documents/download?key=${task.document_key}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline font-medium"
                            >
                              View Submitted Compliance File
                            </a>
                          </div>

                          <div className="flex items-center gap-2 no-print">
                            {task.approval_status !== 'approved' && (
                              <button
                                onClick={() => handleDeleteTaskDoc(task.id, task.document_key)}
                                className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded-lg flex items-center gap-1 font-semibold"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            )}
                            {isBrokerOrAdmin && task.approval_status === 'pending' && (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleUpdateTaskApproval(task.id, 'approved')}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white p-1 rounded-lg flex items-center gap-1"
                                >
                                  <Check className="h-3 w-3" /> Approve
                                </button>
                                <button
                                  onClick={() => {
                                    const note = prompt('Enter rejection reason:')
                                    if (note !== null) handleUpdateTaskApproval(task.id, 'rejected', note)
                                  }}
                                  className="bg-red-50 hover:bg-red-100 text-red-700 p-1 rounded-lg flex items-center gap-1 border border-red-200"
                                >
                                  <X className="h-3 w-3" /> Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (() => {
                        const isUploading = uploadProgress[task.id] !== undefined
                        const progress = uploadProgress[task.id] || 0
                        return (
                          <div className="flex flex-col gap-2">
                            <label className={clsx(
                              "inline-flex items-center gap-1.5 text-xs cursor-pointer font-semibold w-fit no-print px-2.5 py-1.5 rounded-lg",
                              task.document_required ? "text-red-700 hover:text-red-800 bg-red-50 border border-red-200" : "text-blue-600 hover:text-blue-800 bg-blue-50",
                              isUploading && "opacity-50 pointer-events-none"
                            )}>
                              <Upload className="h-3.5 w-3.5" />
                              {isUploading ? `Uploading ${progress}%` : task.document_required ? 'Attach Required Document' : 'Attach Document'}
                              <input
                                type="file"
                                disabled={isUploading}
                                className="hidden"
                                onChange={(e) => handleUploadFile(task.id, e)}
                              />
                            </label>
                            {isUploading && (
                              <div className="w-48 bg-gray-200 h-1 rounded-full overflow-hidden">
                                <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {task.approval_status === 'rejected' && task.approval_notes && (
                        <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                          <strong>Rejection reason:</strong> {task.approval_notes}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Group Quick Add Footer */}
              <div className="border-t border-gray-100 bg-gray-50/40 px-6 py-2.5 no-print">
                {isQuickAddingHere ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder={`Add task to ${groupName}... (Press Enter)`}
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleQuickAddSubmit(groupName as string)
                        } else if (e.key === 'Escape') {
                          setQuickAddGroup(null)
                          setQuickAddTitle('')
                        }
                      }}
                      disabled={isQuickAdding}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 bg-white placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleQuickAddSubmit(groupName as string)}
                      disabled={isQuickAdding || !quickAddTitle.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentTitle = quickAddTitle
                        setQuickAddGroup(null)
                        setQuickAddTitle('')
                        handleOpenModal(groupName === 'Ungrouped Tasks' ? '' : groupName as string, currentTitle)
                      }}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="More task options (due date, requirements)"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddGroup(null)
                        setQuickAddTitle('')
                      }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setQuickAddGroup(groupName as string)
                      setQuickAddTitle('')
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-blue-600 flex items-center gap-1.5 py-1 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add task to {groupName as string}...
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Task Creation Modal */}
      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        existingGroups={existingGroupNames}
        defaultGroup={modalDefaultGroup}
        defaultTitle={modalDefaultTitle}
        onCreateTask={handleCreateTask}
      />
    </div>
  )
}
