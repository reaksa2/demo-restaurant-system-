import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { brandsApi, categoriesApi, zonesApi } from '../services/resources'
import BrandInfoTab from '../components/brand/BrandInfoTab'
import ZonesTab from '../components/brand/ZonesTab'
import CategoriesTab from '../components/brand/CategoriesTab'
import FoodsTab from '../components/brand/FoodsTab'
import OrdersTab from '../components/brand/OrdersTab'

const TABS = [
  { key: 'foods', label: 'Foods' },
  { key: 'categories', label: 'Categories' },
  { key: 'zones', label: 'Zones' },
  { key: 'orders', label: 'Orders' },
  { key: 'info', label: 'Brand info' },
]

export default function BrandDetailPage() {
  const { brandId } = useParams()
  const navigate = useNavigate()
  const [brand, setBrand] = useState(null)
  const [categories, setCategories] = useState([])
  const [zones, setZones] = useState([])
  const [tab, setTab] = useState('foods')
  const [error, setError] = useState('')

  const loadCategories = async () => {
    setCategories(await categoriesApi.list(brandId))
  }
  const loadZones = async () => {
    setZones(await zonesApi.list(brandId))
  }

  const load = async () => {
    try {
      const [b] = await Promise.all([brandsApi.get(brandId), loadCategories(), loadZones()])
      setBrand(b)
    } catch {
      setError('You do not have access to this brand.')
    }
  }

  useEffect(() => { load() }, [brandId])

  if (error) {
    return (
      <div>
        <p className="text-sm text-clay">{error}</p>
        <button onClick={() => navigate('/admin/brands')} className="mt-2 text-sm text-marigold-dark underline">Back to brands</button>
      </div>
    )
  }

  if (!brand) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div>
      <div>
        <p className="text-sm text-slate">{brand.name_en}</p>
        <h1 className="font-khmer-display text-3xl text-ink">{brand.name_kh}</h1>
      </div>

      <div className="mt-6 flex gap-1 border-b border-sand">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-marigold text-ink' : 'border-transparent text-slate hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'info' && <BrandInfoTab brand={brand} onUpdated={setBrand} />}
        {tab === 'zones' && <ZonesTab brandId={brandId} onChange={loadZones} />}
        {tab === 'categories' && <CategoriesTab brandId={brandId} onChange={loadCategories} />}
        {tab === 'foods' && <FoodsTab brandId={brandId} categories={categories} zones={zones} />}
        {tab === 'orders' && <OrdersTab brandId={brandId} />}
      </div>
    </div>
  )
}
