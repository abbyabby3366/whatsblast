export type Customer = {
  id: string
  name?: string
  phone_number: string
  label?: string
  created_at: string
}

export type CustomerImportResult = {
  success?: boolean
  imported?: number
  created?: number
  updated?: number
  skipped?: number
  count?: number
  total?: number
}

export type CustomerResponse = {
  count: number
  next: string | null
  previous: string | null
  page_size: number
  results: Customer[]
}
