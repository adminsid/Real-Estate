import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import {
  Plus, CheckCircle2, Circle, MoreHorizontal, Trash2, FileText, Upload, Check, X
} from 'lucide-react'
import clsx from 'clsx'
import confetti from 'canvas-confetti'

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
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskGroup, setNewTaskGroup] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [newTaskReqAttach, setNewTaskReqAttach] = useState(false)
  const [newTaskReqBroker, setNewTaskReqBroker] = useState(false)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [taskMenuOpen, setTaskMenuOpen] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const compatibleTemplates = availableTemplates.filter((t) => t.type === tx.type)

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setIsAddingTask(true)
    const success = await handleCreateTask({
      title: newTaskTitle,
      attachment_required: newTaskReqAttach,
      broker_approval_required: newTaskReqBroker,
      group_name: newTaskGroup || null,
      due_date: newTaskDueDate || null
    })
    if (success) {
      setNewTaskTitle('')
      setNewTaskGroup('')
      setNewTaskDueDate('')
      setNewTaskReqAttach(false)
      setNewTaskReqBroker(false)
    }
    setIsAddingTask(false)
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
        <div className="border-b border-gray-100 pb-4 flex items-center justify-between no-print">
          <h3 className="font-semibold text-gray-900">Compliance & Tasks Journey</h3>
          <div className="flex gap-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700"
            >
              <option value="">Select template...</option>
              {compatibleTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={() => selectedTemplateId && applyTemplate(selectedTemplateId, true)}
              disabled={!selectedTemplateId}
              className="text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              Apply Template
            </button>
          </div>
        </div>

        <div className="border-b border-gray-100 py-4 bg-white no-print">
          <form onSubmit={handleSubmitTask} className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <input
              type="text"
              placeholder="Manual task name..."
              className="w-full sm:w-1/4 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 bg-white"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              disabled={isAddingTask}
            />
            <button
              type="submit"
              disabled={isAddingTask || !newTaskTitle.trim()}
              className="text-sm font-medium text-white bg-gray-900 border border-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          </form>
        </div>

        <div className="text-center py-12 px-4">
          <h4 className="text-sm font-medium text-gray-900">No journey tasks assigned.</h4>
        </div>
      </div>
    )
  }

  const groups = Array.from(new Set(tasks.map((t: any) => t.group_name || 'Ungrouped Tasks')))

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50/50 no-print">
        <h3 className="font-semibold text-gray-900">Compliance & Tasks Journey</h3>
        <div className="flex gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700"
          >
            <option value="">Select template...</option>
            {compatibleTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            onClick={() => selectedTemplateId && applyTemplate(selectedTemplateId, true)}
            disabled={!selectedTemplateId}
            className="text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            Apply Template
          </button>
        </div>
      </div>

      <div className="border-b border-gray-100 px-6 py-4 bg-white no-print">
        <form onSubmit={handleSubmitTask} className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <input
            type="text"
            placeholder="Manual task name..."
            className="w-full sm:w-1/4 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 bg-white"
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            disabled={isAddingTask}
          />
          <select
            value={newTaskGroup}
            onChange={e => setNewTaskGroup(e.target.value)}
            className="w-full sm:w-1/5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 bg-white"
            disabled={isAddingTask}
          >
            <option value="">No Group</option>
            {Array.from(new Set(tasks.map((t: any) => t.group_name).filter(Boolean))).map(g => (
              <option key={g as string} value={g as string}>{g as string}</option>
            ))}
          </select>
          <input
            type="date"
            value={newTaskDueDate}
            onChange={e => setNewTaskDueDate(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 bg-white"
            disabled={isAddingTask}
            title="Task Due Date"
          />
          <div className="flex gap-4 items-center flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newTaskReqAttach}
                onChange={e => setNewTaskReqAttach(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-xs font-medium text-gray-700">Require Attachment</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newTaskReqBroker}
                onChange={e => setNewTaskReqBroker(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span className="text-xs font-medium text-gray-700">Require Broker Approval</span>
            </label>
            <button
              type="submit"
              disabled={isAddingTask || !newTaskTitle.trim()}
              className="text-sm font-medium text-white bg-gray-900 border border-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          </div>
        </form>
      </div>

      <div className="hidden print:block px-6 py-3 bg-gray-100 font-bold text-sm">
        Compliance Checklist Status
      </div>

      <div className="flex flex-col gap-6 pt-4">
        {groups.map(groupName => {
          const groupTasks = tasks.filter((t: any) => (t.group_name || 'Ungrouped Tasks') === groupName)
          const completedTasks = groupTasks.filter((t: any) => t.status === 'completed')
          const progress = Math.round((completedTasks.length / groupTasks.length) * 100)

          return (
            <div key={groupName as string} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-900">{groupName as string}</h3>
                  <span className="text-xs font-bold text-gray-900">{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                {progress === 100 && (
                  <p className="text-emerald-600 text-xs font-bold animate-pulse flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> All tasks completed successfully!
                  </p>
                )}
              </div>
              <ul className="divide-y divide-gray-100">
                {groupTasks.map((task: any) => (
                  <li key={task.id} className="px-6 py-4 hover:bg-gray-50/30">
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
                            "text-sm font-semibold",
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

                    <div className="mt-3 pl-8 flex flex-col gap-2">
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
                      ) : (task.document_required !== 0 && task.document_required !== false && task.document_required !== '0') && (() => {
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
