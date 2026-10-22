import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'AI 博士 · 26 周强化计划',description:'面向自学者的26周AI路线：机器学习、深度学习、前置解释、分步推导、图示与结果表、渐隐练习、选择题及延迟迁移复测。',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
