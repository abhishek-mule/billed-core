declare module 'pg' {
  export class Pool {
    constructor(config?: any)
    connect(): Promise<any>
    query(text: string, values?: any[]): Promise<any>
    end(): Promise<void>
  }
  
  export interface PoolClient {
    query(text: string, values?: any[]): Promise<any>
    release(): void
  }
  
  export interface QueryResult {
    rows: any[]
    command: string
    rowCount: number
    fields: any[]
  }
}