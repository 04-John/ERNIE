import { createContext, useContext } from 'react'

// The fintech drawer is opened from many places (Overview, Insights, Analytics). This is how they ask for it.
export const DrawerContext = createContext({ openFintech: () => {}, closeFintech: () => {}, openId: null })
export const useFintechDrawer = () => useContext(DrawerContext)
