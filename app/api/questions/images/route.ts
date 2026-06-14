import { NextResponse } from 'next/server'
import { withTeacher } from '@/lib/with-auth'
import { hasPermission } from '@/lib/authz'

const QUESTION_IMAGES_BUCKET = 'question-images'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

export const POST = withTeacher(async (req, { user, profile, db }) => {
  if (!hasPermission(profile, 'questions:create') && !hasPermission(profile, 'questions:update')) {
    return NextResponse.json({ url: null, error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ url: null, error: 'Image file is required' }, { status: 400 })
  }

  const extension = ALLOWED_IMAGE_TYPES.get(file.type)
  if (!extension) {
    return NextResponse.json({ url: null, error: 'Only PNG, JPG, GIF, and WebP images are supported' }, { status: 400 })
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ url: null, error: 'Image must be 10 MB or smaller' }, { status: 400 })
  }

  const storagePath = `manual/${user.id}/${crypto.randomUUID()}.${extension}`
  const { error } = await db.storage
    .from(QUESTION_IMAGES_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (error) {
    return NextResponse.json({ url: null, error: error.message }, { status: 400 })
  }

  const { data } = db.storage
    .from(QUESTION_IMAGES_BUCKET)
    .getPublicUrl(storagePath)

  return NextResponse.json({ url: data.publicUrl, error: null })
})
