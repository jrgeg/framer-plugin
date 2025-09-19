import * as React from 'react'
import { render, Button, List, ListItem, Text, Checkbox, Input } from 'framer'

// Define a simple shape to track each image, how many times it’s used and its size
type ImageUsage = { url: string; count: number; size?: number }

/**
 * Fetch the size of an image on framerusercontent.com.
 * We try a HEAD request first to read the Content Length header. If not
 * available, we fall back to downloading the blob and using its length.
 */
async function fetchSize(url: string): Promise<number | undefined> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    const size = res.headers.get('content-length')
    if (size) return parseInt(size)
    const r = await fetch(url)
    const blob = await r.blob()
    return blob.size
  } catch {
    return undefined
  }
}

// The Framer plugin environment injects a global `framer` object which
// provides access to the canvas and CMS APIs. Declare it here so TypeScript
// doesn’t complain.
declare const framer: any

export function Plugin() {
  const [images, setImages] = React.useState<ImageUsage[]>([])
  const [newUrl, setNewUrl] = React.useState('')
  const [selected, setSelected] = React.useState<Record<string, boolean>>({})

  /**
   * Scan the project for images hosted on framerusercontent.com. It walks
   * through all canvas nodes and CMS items, collecting any URL that appears
   * in the `image` or `src` prop on the canvas, or in CMS item fields.
   */
  async function scan() {
    const usages: Record<string, number> = {}
    // Canvas scanning: iterate through all nodes and collect image URLs
    const nodes = (await framer.getNodes?.()) || []
    for (const node of nodes) {
      const props = node.props || {}
      const url = props.image || props.src
      if (typeof url === 'string' && url.includes('framerusercontent.com')) {
        usages[url] = (usages[url] || 0) + 1
      }
    }
    // CMS scanning: iterate through all collections and their items
    const collections = (await framer.cms.getCollections?.()) || []
    for (const col of collections) {
      const items = (await framer.cms.getItems?.(col.id)) || []
      for (const item of items) {
        for (const val of Object.values(item.fields || {})) {
          if (typeof val === 'string' && val.includes('framerusercontent.com')) {
            usages[val] = (usages[val] || 0) + 1
          }
        }
      }
    }
    // Resolve each URL to its size asynchronously
    const list: ImageUsage[] = await Promise.all(
      Object.entries(usages).map(async ([url, count]) => {
        const size = await fetchSize(url)
        return { url, count, size }
      })
    )
    setImages(list)
    setSelected({})
  }

  /**
   * Replace all selected image URLs with a new one. It updates both
   * canvas node props and CMS item fields. After replacement it rescans
   * the project to refresh the list.
   */
  async function replace() {
    const targets = Object.keys(selected).filter(k => selected[k])
    if (!newUrl || !targets.length) return
    // Update canvas nodes
    const nodes = (await framer.getNodes?.()) || []
    for (const node of nodes) {
      const props = node.props || {}
      const url = props.image || props.src
      if (typeof url === 'string' && targets.includes(url)) {
        await node.setProps?.({ image: newUrl, src: newUrl })
      }
    }
    // Update CMS items
    const collections = (await framer.cms.getCollections?.()) || []
    for (const col of collections) {
      const items = (await framer.cms.getItems?.(col.id)) || []
      for (const item of items) {
        const fields = { ...(item.fields || {}) }
        let changed = false
        for (const key of Object.keys(fields)) {
          const val = fields[key]
          if (typeof val === 'string' && targets.includes(val)) {
            fields[key] = newUrl
            changed = true
          }
        }
        if (changed) {
          await framer.cms.patchItem?.(col.id, item.id, { fields })
        }
      }
    }
    await scan()
    setNewUrl('')
  }

  // Initial scan on mount
  React.useEffect(() => {
    scan()
  }, [])

  return (
    <div style={{ width: 360, padding: 12 }}>
      <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>
        Imágenes framerusercontent en el proyecto
      </Text>
      <List>
        {images.map(({ url, count, size }) => (
          <ListItem key={url}>
            <Checkbox
              checked={!!selected[url]}
              onChange={v => setSelected(s => ({ ...s, [url]: v }))}
            />
            <div style={{ marginLeft: 8 }}>
              <Text style={{ fontSize: 12 }}>{url}</Text>
              <Text style={{ fontSize: 12 }}>Usos: {count}</Text>
              <Text style={{ fontSize: 12 }}>
                Tamaño: {size ? `${(size / 1024).toFixed(2)} KB` : '—'}
              </Text>
            </div>
          </ListItem>
        ))}
      </List>
      <div style={{ marginTop: 12 }}>
        <Input
          placeholder="URL nueva…"
          value={newUrl}
          onChange={v => setNewUrl(v)}
        />
        <Button
          onClick={replace}
          disabled={!newUrl || !Object.values(selected).some(Boolean)}
        >
          Sustituir seleccionadas
        </Button>
        <Button onClick={scan} style={{ marginLeft: 8 }}>
          Reescanear
        </Button>
      </div>
      <Text style={{ fontSize: 10, opacity: 0.6, marginTop: 12 }}>
        Reemplaza todas las referencias a imágenes seleccionadas por la URL nueva. El tamaño
        se obtiene con un HEAD o GET.
      </Text>
    </div>
  )
}

// Render the plugin when loaded
render(<Plugin />)
