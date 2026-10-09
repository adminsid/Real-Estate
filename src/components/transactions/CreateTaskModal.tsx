import { useState, useEffect } from 'react'
import { X, Loader2, Calendar, FolderPlus, ShieldCheck, Paperclip, Plus } from 'lucide-react'
import clsx from 'clsx'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  existingGroups: string[]
  defaultGroup?: string
  defaultTitle?: string
  onCreateTask: (payload: {
    title: string
    attachment_required: boolean
    broker_approval_required: boolean
    group_name: string | null
    due_date: string | null
  }) => Promise<boolean>
}

export function CreateTaskModal({
  isOpen,
  onClose,
  existingGroups,
  defaultGroup = '',
  defaultTitle = '',
  onCreateTask
}: CreateTaskModalProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [selectedGroup, setSelectedGroup] = useState(defaultGroup)
  const [customGroup, setCustomGroup] = useState('')
  const [isCustomGroup, setIsCustomGroup] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [reqAttach, setReqAttach] = useState(false)
  const [reqBroker, setReqBroker] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle)
      if (defaultGroup && !existingGroups.includes(defaultGroup)) {
        setIsCustomGroup(true)
        setCustomGroup(defaultGroup)
        setSelectedGroup('__NEW__')
      } else {
        setIsCustomGroup(false)
        setCustomGroup('')
        setSelectedGroup(defaultGroup)
      }
      setDueDate('')
      setReqAttach(false)
      setReqBroker(false)
      setIsSubmitting(false)
    }
  }, [isOpen, defaultGroup, defaultTitle, existingGroups])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || isSubmitting) return

    const finalGroup = isCustomGroup
      ? (customGroup.trim() || null)
      : (selectedGroup.trim() || null)

    setIsSubmitting(true)
    const success = await onCreateTask({
      title: title.trim(),
      attachment_required: reqAttach,
      broker_approval_required: reqBroker,
      group_name: finalGroup,
      due_date: dueDate || null
    })
    setIsSubmitting(false)

    if (success) {
      onClose()
    }
  }

  const handleGroupSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val === '__NEW__') {
      setIsCustomGroup(true)
      setSelectedGroup('__NEW__')
    } else {
      setIsCustomGroup(false)
      setSelectedGroup(val)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Add Journey Task</h2>
              <p className="text-xs text-gray-500">Create a custom compliance or closing milestone task</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Task Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. Schedule Home Inspection"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>

          {/* Group & Due Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Group */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <FolderPlus className="h-3.5 w-3.5 text-gray-400" /> Journey Group
              </label>
              {!isCustomGroup ? (
                <select
                  value={selectedGroup}
                  onChange={handleGroupSelectChange}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  <option value="">No Group (Ungrouped)</option>
                  {existingGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  <option value="__NEW__">+ Create New Group...</option>
                </select>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="New group name..."
                    value={customGroup}
                    onChange={(e) => setCustomGroup(e.target.value)}
                    disabled={isSubmitting}
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomGroup(false)
                      setSelectedGroup('')
                    }}
                    className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Cancel custom group"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-gray-400" /> Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>
          </div>

          {/* Compliance & Approval Requirements */}
          <div className="pt-2 flex flex-col gap-2.5">
            <label className="text-xs font-semibold text-gray-700">Compliance Requirements</label>

            <label className={clsx(
              "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer",
              reqAttach ? "border-blue-200 bg-blue-50/50" : "border-gray-200 hover:bg-gray-50/50 bg-white"
            )}>
              <input
                type="checkbox"
                checked={reqAttach}
                onChange={(e) => setReqAttach(e.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-gray-500" /> Require Document Attachment
                </span>
                <span className="text-[11px] text-gray-500">
                  Task cannot be marked complete until an agent uploads a compliance document.
                </span>
              </div>
            </label>

            <label className={clsx(
              "flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer",
              reqBroker ? "border-blue-200 bg-blue-50/50" : "border-gray-200 hover:bg-gray-50/50 bg-white"
            )}>
              <input
                type="checkbox"
                checked={reqBroker}
                onChange={(e) => setReqBroker(e.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-gray-500" /> Require Broker Approval
                </span>
                <span className="text-[11px] text-gray-500">
                  Uploaded documents must be reviewed and approved by a broker/admin.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Adding...
                </>
              ) : (
                'Add Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
