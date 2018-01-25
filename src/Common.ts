import { EnhancedConnection } from "./storage/MySqlStore"

export interface ExecuteContext {
    conn?: EnhancedConnection
}
