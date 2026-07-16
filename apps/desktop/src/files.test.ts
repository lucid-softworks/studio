import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWrite, mimeForPath, nextRecent, safeScratchKey } from './files.js'

let directory = ''
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = '' })

describe('desktop files', () => {
  it('writes complete files through a same-directory atomic replacement', async () => {
    directory = await mkdtemp(join(tmpdir(), 'studio-desktop-'))
    const path = join(directory, 'project.studio')
    await atomicWrite(path, new TextEncoder().encode('first'))
    await atomicWrite(path, new TextEncoder().encode('second'))
    expect(await readFile(path, 'utf8')).toBe('second')
  })

  it('normalizes recent files, MIME types, and scratch keys', () => {
    expect(nextRecent(['/a', '/b'], '/b')).toEqual(['/b', '/a'])
    expect(mimeForPath('image.PSD')).toBe('image/vnd.adobe.photoshop')
    expect(safeScratchKey('../../private project')).toBe('______private_project')
  })
})
