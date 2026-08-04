import { useState, useRef } from 'react'
import { Upload, FileText, CheckCircle, Save, Download } from 'lucide-react'

export function FormFillerPage() {
  const [file, setFile] = useState<File | null>(null)
  const [fields, setFields] = useState<Array<{ id: string; label: string; value: string }>>([
    { id: 'f1', label: 'Client Name', value: '' },
    { id: 'f2', label: 'Property Address', value: '' },
    { id: 'f3', label: 'Offer Amount', value: '' },
  ])
  const [isMapping, setIsMapping] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setIsMapping(true)
    }
  }

  const updateField = (id: string, value: string) => {
    setFields(fields.map(f => f.id === id ? { ...f, value } : f))
  }

  const handleFillForm = () => {
    // Simulate API call to PDF mapping service
    setTimeout(() => {
      setIsMapping(false)
      setIsCompleted(true)
    }, 1500)
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-gray-100 px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">PDF Form Filler (PoC)</h1>
            <p className="text-gray-500 text-sm mt-1">Upload a PDF template and map data fields automatically.</p>
          </div>
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded">EXPERIMENTAL</span>
        </div>

        <div className="p-8">
          {!file && (
            <div 
              className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-800">Upload PDF Template</h3>
              <p className="text-gray-500 text-sm mt-2">Select a fillable PDF form to map fields to.</p>
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="application/pdf"
                onChange={handleFileChange}
              />
            </div>
          )}

          {file && isMapping && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="border border-gray-200 rounded-xl bg-gray-50 p-6 flex flex-col items-center justify-center min-h-[400px]">
                <FileText className="h-16 w-16 text-gray-400 mb-4" />
                <p className="font-semibold text-gray-700 text-center">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">Ready for mapping</p>
                <div className="w-full mt-8 bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Detected Fields in PDF</p>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /> buyer_name</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /> property_street_address</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /> offer_price</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Map Data Source</h3>
                <div className="space-y-4">
                  {fields.map(f => (
                    <div key={f.id}>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{f.label}</label>
                      <input 
                        type="text" 
                        value={f.value}
                        onChange={e => updateField(f.id, e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                        placeholder={`Enter ${f.label.toLowerCase()}...`}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <button 
                    onClick={handleFillForm}
                    className="w-full bg-brand-navy text-white rounded-xl py-3 font-bold hover:bg-brand-navy-light transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="h-5 w-5" /> Generate Filled PDF
                  </button>
                  <button 
                    onClick={() => { setFile(null); setIsMapping(false); setIsCompleted(false); }}
                    className="w-full mt-3 bg-white text-gray-600 border border-gray-200 rounded-xl py-3 font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Cancel / Start Over
                  </button>
                </div>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="text-center py-12">
              <div className="bg-emerald-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">PDF Successfully Filled!</h2>
              <p className="text-gray-500 mb-8 max-w-md mx-auto">
                The data has been successfully mapped and merged into the PDF template. You can now download the finished document.
              </p>
              
              <div className="flex justify-center gap-4">
                <button 
                  onClick={() => alert('Downloading filled_document.pdf...')}
                  className="bg-brand-navy text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-navy-light transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Download className="h-5 w-5" /> Download PDF
                </button>
                <button 
                  onClick={() => { setFile(null); setIsMapping(false); setIsCompleted(false); }}
                  className="bg-white text-gray-700 border border-gray-200 px-6 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                >
                  Fill Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
