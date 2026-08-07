import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import {
  FolderPlus, Upload, Folder, FileText, Edit3, Move, Trash2, ChevronRight
} from 'lucide-react'
import clsx from 'clsx'

export function TransactionDocumentsTab() {
  const { user } = useAuth()
  const {
    id,
    data,
    fetchTransaction,
    handleRename,
    handleMove,
    handleDeleteTaskDoc,
    handleUploadTaskDocWithProgress,
  } = useTransactionDetail()

  const { transaction: tx, tasks = [], documents = [] } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)
  const isLocked = tx.is_locked === 1
  const canEdit = !isLocked || isBrokerOrAdmin

  const [docSubTab, setDocSubTab] = useState<'all' | 'checklist'>('all')
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const [docUploadProgress, setDocUploadProgress] = useState<number | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const handleCreateFolderSubmit = async () => {
    if (!newFolderName.trim()) return
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_folder: 1,
          entity_type: 'transaction',
          entity_id: id,
          file_name: newFolderName,
          parent_id: currentFolderId
        })
      })
      if (res.ok) {
        setNewFolderName('')
        setIsCreatingFolder(false)
        fetchTransaction()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocUploadProgress(0)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entity_type', 'transaction')
      formData.append('entity_id', id || '')
      if (currentFolderId) {
        formData.append('parent_id', currentFolderId)
      }

      const xhr = new XMLHttpRequest()
      const uploadJson = await new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setDocUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error('Upload failed'))
          }
        })
        xhr.open('POST', '/api/documents/upload')
        xhr.send(formData)
      })

      if (uploadJson.success) {
        fetchTransaction()
      } else {
        alert('Upload failed')
      }
    } catch (err: any) {
      console.error(err)
      alert('Upload failed')
    } finally {
      setDocUploadProgress(null)
    }
  }

  const handleUploadChecklistFile = async (taskId: string, e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleDeleteDocument = async (doc: any) => {
    if (!confirm(`Are you sure you want to delete this ${doc.is_folder === 1 ? 'folder and all its contents' : 'file'}?`)) return
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      if (res.ok) fetchTransaction()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-gray-900">Documents Manager</h3>
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
            <button
              onClick={() => setDocSubTab('all')}
              className={clsx("px-3 py-1 rounded-md transition-colors", docSubTab === 'all' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              All Files
            </button>
            <button
              onClick={() => setDocSubTab('checklist')}
              className={clsx("px-3 py-1 rounded-md transition-colors flex items-center gap-1", docSubTab === 'checklist' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              Checklist
              {tasks?.filter((t: any) => t.document_required && !t.document_key).length > 0 && (
                <span className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {tasks.filter((t: any) => t.document_required && !t.document_key).length}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            onClick={() => setIsCreatingFolder(true)}
            disabled={!canEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 bg-white disabled:opacity-50"
          >
            <FolderPlus className="h-4 w-4 text-gray-500" /> New Folder
          </button>

          {canEdit ? (
            <div className="flex flex-col gap-1 items-end">
              <label className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white cursor-pointer shadow-sm",
                docUploadProgress !== null && "opacity-50 pointer-events-none"
              )}>
                <Upload className="h-4 w-4" />
                <span>{docUploadProgress !== null ? `Uploading ${docUploadProgress}%` : 'Upload File'}</span>
                <input
                  type="file"
                  className="hidden"
                  disabled={docUploadProgress !== null}
                  onChange={handleFileUpload}
                />
              </label>
              {docUploadProgress !== null && (
                <div className="w-28 bg-gray-200 h-1 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${docUploadProgress}%` }} />
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-400 border border-gray-200 shadow-sm cursor-not-allowed">
              <Upload className="h-4 w-4" />
              <span>Upload Locked</span>
            </span>
          )}
        </div>
      </div>

      {isCreatingFolder && (
        <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-150 no-print">
          <input
            type="text"
            required
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white"
          />
          <button
            onClick={handleCreateFolderSubmit}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700"
          >
            Create
          </button>
          <button
            onClick={() => {
              setIsCreatingFolder(false)
              setNewFolderName('')
            }}
            className="border border-gray-350 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white"
          >
            Cancel
          </button>
        </div>
      )}

      {docSubTab === 'all' && (
        <>
          <div className="flex items-center gap-1 text-xs text-gray-500 py-1 bg-gray-50 px-3 rounded-lg border border-gray-100">
            <button
              onClick={() => setCurrentFolderId(null)}
              className="font-semibold text-blue-600 hover:underline"
            >
              Home
            </button>
            {(() => {
              const crumbs: any[] = []
              let folderId = currentFolderId
              while (folderId) {
                const folder = documents.find((d: any) => d.id === folderId)
                if (!folder) break
                crumbs.unshift(folder)
                folderId = folder.parent_id
              }
              return crumbs.map((crumb, idx) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  <button
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={clsx(
                      "font-semibold hover:underline",
                      idx === crumbs.length - 1 ? "text-gray-700 font-bold" : "text-blue-600"
                    )}
                  >
                    {crumb.file_name || crumb.original_name}
                  </button>
                </span>
              ))
            })()}
          </div>

          {(() => {
            const currentDocs = documents.filter((d: any) => d.parent_id === currentFolderId)
            if (currentDocs.length === 0) {
              return (
                <div className="text-center py-12 text-sm text-gray-500">
                  This folder is empty.
                </div>
              )
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentDocs.map((doc: any) => {
                  const isFolder = doc.is_folder === 1
                  const fileName = doc.file_name || doc.original_name
                  const fileKey = doc.file_key || doc.storage_key

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {isFolder ? (
                          <button
                            onClick={() => setCurrentFolderId(doc.id)}
                            className="flex items-center gap-3 text-left w-full hover:text-blue-600"
                          >
                            <Folder className="h-9 w-9 text-amber-500 flex-shrink-0" />
                            <div className="min-w-0">
                              {renamingDocId === doc.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameName}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setRenameName(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await handleRename(doc.id, renameName)
                                      setRenamingDocId(null)
                                    }
                                  }}
                                  onBlur={() => setRenamingDocId(null)}
                                  className="rounded border border-gray-300 px-2 py-0.5 text-xs bg-white text-gray-800"
                                />
                              ) : (
                                <p className="text-sm font-bold truncate">{fileName}</p>
                              )}
                              <p className="text-[10px] text-gray-400">Folder</p>
                            </div>
                          </button>
                        ) : (
                          <a
                            href={`/api/documents/download?key=${fileKey}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 text-left w-full hover:text-blue-600"
                          >
                            <FileText className="h-9 w-9 text-blue-500 flex-shrink-0" />
                            <div className="min-w-0">
                              {renamingDocId === doc.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameName}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setRenameName(e.target.value)}
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await handleRename(doc.id, renameName)
                                      setRenamingDocId(null)
                                    }
                                  }}
                                  onBlur={() => setRenamingDocId(null)}
                                  className="rounded border border-gray-300 px-2 py-0.5 text-xs bg-white text-gray-800"
                                />
                              ) : (
                                <p className="text-sm font-bold truncate">{fileName}</p>
                              )}
                              <p className="text-[10px] text-gray-400">
                                {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(1)} KB` : '0 KB'} • {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                        <button
                          onClick={() => {
                            setRenamingDocId(doc.id)
                            setRenameName(fileName)
                          }}
                          className="p-1 rounded hover:bg-gray-200 text-gray-500"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setMovingDocId(doc.id)}
                          className="p-1 rounded hover:bg-gray-200 text-gray-500"
                        >
                          <Move className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteDocument(doc)}
                          className="p-1 rounded hover:bg-red-50 text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {movingDocId && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-sm w-full p-5 border border-gray-100 shadow-xl space-y-4">
                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Move className="h-4.5 w-4.5 text-blue-600" /> Move to Folder
                </h4>
                <p className="text-xs text-gray-500">Select where to move this document:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2 bg-gray-50/50">
                  <button
                    onClick={() => { handleMove(movingDocId, 'ROOT'); setMovingDocId(null) }}
                    className="w-full text-left text-xs font-semibold py-1.5 px-2 hover:bg-blue-50 rounded hover:text-blue-700 flex items-center gap-2"
                  >
                    <Folder className="h-4 w-4 text-amber-500" /> [Root Folder]
                  </button>
                  {documents
                    .filter((d: any) => d.is_folder === 1 && d.id !== movingDocId)
                    .map((folder: any) => (
                      <button
                        key={folder.id}
                        onClick={() => { handleMove(movingDocId, folder.id); setMovingDocId(null) }}
                        className="w-full text-left text-xs font-semibold py-1.5 px-2 hover:bg-blue-50 rounded hover:text-blue-700 flex items-center gap-2"
                      >
                        <Folder className="h-4 w-4 text-amber-500" /> {folder.file_name || folder.original_name}
                      </button>
                    ))
                  }
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setMovingDocId(null)}
                    className="border border-gray-350 text-gray-700 bg-white hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {docSubTab === 'checklist' && (
        <>
          {(() => {
            const requiredTasks = tasks.filter((t: any) => t.document_required)
            if (requiredTasks.length === 0) return (
              <div className="text-center py-12 text-sm text-gray-500">
                <p className="font-medium">No checklist document requirements yet.</p>
              </div>
            )

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {requiredTasks.map((task: any) => {
                    const isUploading = uploadProgress[task.id] !== undefined
                    const progress = uploadProgress[task.id] || 0

                    return (
                      <div key={task.id} className="rounded-xl border border-gray-150 p-4 bg-gray-50/50 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-bold text-gray-800 text-xs">{task.title}</h5>
                            <p className="text-[10px] text-gray-400 mt-0.5">Group: {task.group_name || 'General'}</p>
                          </div>
                          <span className={clsx(
                            "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                            task.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {task.status === 'completed' ? 'Completed' : 'Pending'}
                          </span>
                        </div>

                        {task.document_key ? (
                          <div className="bg-white rounded-lg p-2.5 border border-gray-200 flex items-center justify-between text-xs">
                            <a
                              href={`/api/documents/download?key=${task.document_key}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline font-semibold truncate flex-1 min-w-0"
                            >
                              View Submitted File
                            </a>
                            <div className="flex items-center gap-2">
                              {task.approval_status && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-emerald-100 text-emerald-700">
                                  {task.approval_status}
                                </span>
                              )}
                              <button
                                onClick={() => handleDeleteTaskDoc(task.id, task.document_key)}
                                className="text-red-500 hover:text-red-700 font-bold"
                              >
                                unlink
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5">
                                <Upload className="h-3 w-3" />
                                {isUploading ? `Uploading ${progress}%` : 'Upload & Link File'}
                                <input
                                  type="file"
                                  disabled={isUploading}
                                  className="hidden"
                                  onChange={(e) => handleUploadChecklistFile(task.id, e)}
                                />
                              </label>

                              {documents.filter((d: any) => d.is_folder === 0).length > 0 && (
                                <select
                                  onChange={async (e) => {
                                    const fileKey = e.target.value
                                    if (!fileKey) return
                                    try {
                                      await fetch(`/api/transactions/${id}/tasks/${task.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ document_key: fileKey })
                                      })
                                      fetchTransaction()
                                    } catch (err) {
                                      console.error(err)
                                    }
                                  }}
                                  className="text-xs bg-white border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none flex-1 max-w-[180px]"
                                >
                                  <option value="">Link Existing File...</option>
                                  {documents
                                    .filter((d: any) => d.is_folder === 0)
                                    .map((d: any) => (
                                      <option key={d.id} value={d.file_key}>{d.file_name || d.original_name}</option>
                                    ))}
                                </select>
                              )}
                            </div>
                            {isUploading && (
                              <div className="w-full bg-gray-250 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
