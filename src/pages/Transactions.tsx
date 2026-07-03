import { ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { APP_MODULES } from '@/utils/constants'

export function TransactionsPage() {
  const modules = APP_MODULES.filter((m) => m.category === 'transactions')

  return (
    <Layout title="Transactions">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <ArrowLeftRight className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Transaction Management</h2>
          <p className="text-sm text-gray-500">Manage CMAs, forms, e-signatures, and transaction workflows</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {modules.map((mod) => (
          <AppTile key={mod.id} module={mod} size="lg" />
        ))}
      </div>

      <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
        <h3 className="font-bold text-blue-800 mb-2">NY Real Estate Transaction Resources</h3>
        <ul className="space-y-2 text-sm text-blue-700">
          <li>
            <Link to="/transactions/cma" className="hover:underline font-medium">→ Create a Comparative Market Analysis (CMA)</Link>
          </li>
          <li>
            <a href="https://www.dos.ny.gov/licensing/re_salesperson/re_salesperson.html" target="_blank" rel="noopener noreferrer" className="hover:underline">→ NY DOS Real Estate Forms & Disclosures</a>
          </li>
          <li>
            <a href="https://www.nar.realtor/" target="_blank" rel="noopener noreferrer" className="hover:underline">→ NAR Resources for Agents</a>
          </li>
        </ul>
      </div>
    </Layout>
  )
}
