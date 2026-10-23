import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'AI Systems 学习与岗位实训',description:'从零基础到推理优化与软硬协同：中文课程、交互实验、真实实践证据与岗位工单；按能力推进，不限周数。',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
