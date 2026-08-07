import { useState, useRef } from 'react'
import { UploadCloud, FileText, Download, Trash2, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface DocumentType {
  id: string
  file_name: string
  size_bytes: number
  created_at: string
  first_name?: string
  last_name?: string
}

interface DocumentUploaderProps {
  entityType: string
  entityId: string
  documents: DocumentType[]
  onUploadComplete: () => void
}

export function DocumentUploader({ entityType, entityId, documents, onUploadComplete }: DocumentUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFile(e.dataTransfer.files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFile(e.target.files[0])
    }
  }

  const uploadFile = async (file: File) => {
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('entity_type', entityType)
    formData.append('entity_id', entityId)

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        onUploadComplete()
      }
    } catch (e) {
      console.error('Upload failed', e)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      if (res.ok) {
        onUploadComplete()
      }
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="space-y-4">
      <div 
        className={clsx(
          "border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer",
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileSelect}
        />
        {isUploading ? (
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-2" />
            <p className="text-sm font-medium text-gray-900">Uploading...</p>
          </div>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
            <p className="text-xs text-gray-500 mt-1">PDF, DOCX, JPG, or PNG (max 100MB)</p>
          </>
        )}
      </div>

      {documents.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <ul className="divide-y divide-gray-100">
            {documents.map(doc => (
              <li key={doc.id} className="flex items-center justify-between p-4 hover:bg-gray-50 group">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-500">
                      {formatSize(doc.size_bytes)} • Uploaded by {doc.first_name ? `${doc.first_name} ${doc.last_name}` : 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a 
                    href={`/api/documents/${doc.id}/download`} 
                    download
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
