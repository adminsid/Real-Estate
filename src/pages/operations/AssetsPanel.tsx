import { useState, type FormEvent } from 'react'
import { ArrowUpRight, Upload } from 'lucide-react'
import {
  safeAssetUrl,
  parseAssetTags,
  type ProjectAsset,
  type ProjectRecord,
} from '@/domain/operations'
import { uploadAsset } from './operations-api'
export function AssetsPanel({
  project,
  busy,
  onSave,
}: {
  project: ProjectRecord
  busy: boolean
  onSave: (project: ProjectRecord) => Promise<boolean>
}) {
  const [error, setError] = useState(''),
    [uploading, setUploading] = useState(false),
    [query, setQuery] = useState(''),
    [tagFilter, setTagFilter] = useState('')
  const tags = [
    ...new Set(project.assets.flatMap((asset) => asset.tags || [])),
  ].sort()
  const visible = project.assets.filter(
    (asset) =>
      (!tagFilter || asset.tags?.includes(tagFilter)) &&
      `${asset.name} ${asset.kind} ${(asset.tags || []).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const asset = await uploadAsset(project.id, file)
      if (!(await onSave({ ...project, assets: [...project.assets, asset] })))
        setError(
          'File uploaded but not attached. Reload the project before retrying.',
        )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }
  async function addLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget,
      data = new FormData(form)
    const url = String(data.get('url'))
    if (!safeAssetUrl(url)) {
      setError('Use an HTTPS asset link.')
      return
    }
    const asset: ProjectAsset = {
      id: crypto.randomUUID(),
      name: String(data.get('name')),
      kind: data.get('kind') as ProjectAsset['kind'],
      url,
      hero: false,
      tags: parseAssetTags(String(data.get('tags') || '')),
    }
    if (await onSave({ ...project, assets: [...project.assets, asset] }))
      form.reset()
  }
  async function remove(asset: ProjectAsset) {
    if (project.tasks.some((t) => t.assetIds.includes(asset.id))) {
      setError('Detach this asset from its deliverables before removing it.')
      return
    }
    await onSave({
      ...project,
      assets: project.assets.filter((a) => a.id !== asset.id),
    })
  }
  return (
    <section className="ops-panel">
      <div className="ops-section-heading">
        <div>
          <h2>Project assets</h2>
          <p>
            One shared collection for photos, flyers, videos, and documents.
          </p>
        </div>
        <label className="ops-upload">
          <Upload size={16} />
          {uploading ? 'Uploading…' : 'Upload file'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
            disabled={busy || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="ops-hint">
        Upload files up to 20 MB, or link larger media from Inventory’s document
        vault. Property documents remain in their canonical vault.
      </p>
      {error && (
        <div className="ops-error" role="alert">
          {error}
        </div>
      )}
      <div className="ops-asset-filters">
        <label>
          Search assets
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, type or tag"
          />
        </label>
        <label>
          Tag
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <small>
          {visible.length} of {project.assets.length} assets
        </small>
      </div>
      <div className="ops-assets">
        {visible.map((asset) => (
          <article key={asset.id}>
            <a
              className="ops-asset-preview"
              href={asset.url}
              target="_blank"
              rel="noreferrer"
            >
              {asset.kind === 'photo' ? (
                <img src={asset.url} alt={asset.name} />
              ) : (
                <span>
                  {asset.kind.toUpperCase()} <ArrowUpRight size={20} />
                </span>
              )}
            </a>
            <div>
              <strong>{asset.name}</strong>
              <small>{asset.hero ? 'Hero image' : asset.kind}</small>
              <div className="ops-tags">
                {(asset.tags || []).map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => setTagFilter(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <AssetTags
                key={`${asset.id}:${(asset.tags || []).join(',')}`}
                asset={asset}
                busy={busy}
                onSave={async (tags) =>
                  onSave({
                    ...project,
                    assets: project.assets.map((current) =>
                      current.id === asset.id ? { ...current, tags } : current,
                    ),
                  })
                }
              />
              <div className="ops-actions">
                <a href={asset.url} target="_blank" rel="noreferrer">
                  Open <ArrowUpRight size={12} />
                </a>
                {asset.kind === 'photo' && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void onSave({
                        ...project,
                        assets: project.assets.map((a) => ({
                          ...a,
                          hero: a.id === asset.id ? !a.hero : false,
                        })),
                      })
                    }
                  >
                    {asset.hero ? 'Clear hero' : 'Set hero'}
                  </button>
                )}
                <button disabled={busy} onClick={() => void remove(asset)}>
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!!project.assets.length && !visible.length && (
        <p className="ops-empty">No assets match this search.</p>
      )}
      {!project.assets.length && (
        <p className="ops-empty">Upload your first file or add a link below.</p>
      )}
      <form onSubmit={(e) => void addLink(e)} className="ops-link-form">
        <fieldset disabled={busy || uploading}>
          <h3>Add an existing asset</h3>
          <div className="ops-form-grid">
            <label>
              Asset name
              <input name="name" required maxLength={240} />
            </label>
            <label>
              Type
              <select name="kind" defaultValue="link">
                <option value="link">Link</option>
                <option value="photo">Photo</option>
                <option value="flyer">Flyer</option>
                <option value="video">Video</option>
                <option value="document">Document</option>
              </select>
            </label>
          </div>
          <label>
            Asset URL
            <input
              name="url"
              type="url"
              required
              placeholder="https://…"
              maxLength={2000}
            />
          </label>
          <label>
            Tags
            <input
              name="tags"
              maxLength={820}
              placeholder="signed agreement, mls, photos"
            />
            <small>Separate tags with commas.</small>
          </label>
          <button type="submit">Add asset link</button>
        </fieldset>
      </form>
    </section>
  )
}

function AssetTags({
  asset,
  busy,
  onSave,
}: {
  asset: ProjectAsset
  busy: boolean
  onSave: (tags: string[]) => Promise<boolean>
}) {
  const [draft, setDraft] = useState((asset.tags || []).join(', ')),
    [error, setError] = useState('')
  async function save() {
    const tags = parseAssetTags(draft)
    if (tags.length > 20 || tags.some((tag) => tag.length > 40)) {
      setError('Use up to 20 tags, each 40 characters or fewer.')
      return
    }
    if (await onSave(tags)) setError('')
  }
  return (
    <details className="ops-edit-tags">
      <summary>Edit tags</summary>
      <label>
        Tags for {asset.name}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={820}
          placeholder="Separate tags with commas"
        />
      </label>
      <button type="button" disabled={busy} onClick={() => void save()}>
        Save tags
      </button>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
    </details>
  )
}
