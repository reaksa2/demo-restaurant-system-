import { useEffect, useState } from 'react'
import { brandsApi } from '../services/resources'
import { Select } from './ui'

/**
 * The back-office pages work on ONE brand at a time. Roles tied to a single
 * brand (accountant, sales) just get that brand; managers with several
 * brands get a picker. Scoping is done server-side by brandsApi.list().
 */
export function useBrands() {
  const [brands, setBrands] = useState([])
  const [brandId, setBrandId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    brandsApi.list().then((list) => {
      setBrands(list)
      setBrandId((cur) => cur || list[0]?.id || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return { brands, brandId, setBrandId, loading, brand: brands.find((b) => b.id === brandId) }
}

export function BrandPicker({ brands, brandId, onChange, allowAll = false }) {
  if (brands.length <= 1 && !allowAll) {
    return brands[0] ? <span className="text-sm text-slate">{brands[0].name_en}</span> : null
  }
  return (
    <div className="w-56 print:hidden">
      <Select value={brandId} onChange={(e) => onChange(e.target.value)} aria-label="Brand">
        {allowAll && <option value="all">All brands</option>}
        {brands.map((b) => <option key={b.id} value={b.id}>{b.name_en}</option>)}
      </Select>
    </div>
  )
}

export function PeriodPicker({ period, onPeriod, from, to, onFrom, onTo, periods }) {
  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <div className="w-40">
        <Select value={period} onChange={(e) => onPeriod(e.target.value)} aria-label="Period">
          {periods.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </Select>
      </div>
      {period === 'custom' && (
        <>
          <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="rounded-md border border-sand bg-white px-3 py-2 text-sm" aria-label="From" />
          <span className="pb-2 text-sm text-slate">to</span>
          <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="rounded-md border border-sand bg-white px-3 py-2 text-sm" aria-label="To" />
        </>
      )}
    </div>
  )
}
