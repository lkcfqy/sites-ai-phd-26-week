import {useId} from 'react';
const colors=['#157c8c','#c36a35','#7259a0'];
function Plot({title,xLabel,yLabel,series,domain}:{title:string;xLabel:string;yLabel:string;series:{name:string;points:[number,number][]}[];domain?:[number,number,number,number]}){
 const id=useId(),points=series.flatMap(row=>row.points),xmin=domain?.[0]??Math.min(...points.map(p=>p[0])),xmax=domain?.[1]??Math.max(...points.map(p=>p[0])),ymin=domain?.[2]??Math.min(0,...points.map(p=>p[1])),ymax=domain?.[3]??Math.max(...points.map(p=>p[1]));
 const x=(value:number)=>54+(value-xmin)/(xmax-xmin||1)*316,y=(value:number)=>172-(value-ymin)/(ymax-ymin||1)*134;
 return <><svg viewBox="0 0 420 220" role="img" aria-labelledby={id}><title id={id}>{title}</title><path d="M54 32V172H378" fill="none" stroke="#8498a8"/>{[0,.5,1].map(value=><g key={value}><line x1="54" x2="378" y1={38+134*value} y2={38+134*value} stroke="#e3eaf0"/><text x="47" y={42+134*value} textAnchor="end" fontSize="11">{Number((ymax-(ymax-ymin)*value).toFixed(3))}</text><text x={54+316*value} y="190" textAnchor="middle" fontSize="11">{Number((xmin+(xmax-xmin)*value).toFixed(3))}</text></g>)}{series.map((row,index)=><g key={row.name}><polyline fill="none" stroke={colors[index%colors.length]} strokeWidth="2.5" points={row.points.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}/>{row.points.length<15&&row.points.map((p,i)=><circle key={i} cx={x(p[0])} cy={y(p[1])} r="3" fill={colors[index%colors.length]}/>)}</g>)}<text x="218" y="211" fontSize="12" textAnchor="middle">{xLabel}</text><text x="12" y="105" fontSize="12" transform="rotate(-90 12 105)" textAnchor="middle">{yLabel}</text></svg><div className="study-chart-legend">{series.map((row,index)=><span key={row.name}><i style={{background:colors[index%colors.length]}}/>{row.name}</span>)}</div></>;
}
function Flow({labels,caption}:{labels:string[];caption:string}){return <div className="study-flow" role="img" aria-label={labels.join(' → ')+'. '+caption}>{labels.map((label,index)=><div key={index}>{index>0&&<span aria-hidden="true">→</span>}<strong>{label}</strong></div>)}</div>}
function Pixels({values,labels,title}:{values:number[][];labels?:string[][];title:string}){const id=useId();return <svg viewBox={`0 0 420 ${values.length*55+38}`} role="img" aria-labelledby={id}><title id={id}>{title}</title>{values.map((row,r)=>row.map((value,c)=><g key={r+'-'+c}><rect x={54+c*(310/row.length)} y={10+r*55} width={310/row.length-5} height="49" rx="5" fill={`rgba(21,124,140,${.08+value*.7})`}/><text x={54+(c+.5)*(310/row.length)-2} y={40+r*55} textAnchor="middle" fontSize="13">{labels?.[r]?.[c]??String(value)}</text></g>))}</svg>}
export default function LessonVisual({lessonId}:{lessonId:string}){
 let title='',caption='',graphic:React.ReactNode=null;
 if(lessonId==='w03-d5'||lessonId==='w24-d3'){
  title='相同的2点差距，在两种纵轴范围下';caption='两图都使用80、81、82这三个教学数值。左轴从0起，右轴从78起；实际差值始终是2，视觉高度比例取决于轴起点。';
  graphic=<div className="study-chart-pair">{[0,78].map(base=><svg viewBox="0 0 220 190" role="img" aria-label={'纵轴从'+base+'开始，三个值80、81、82'} key={base}><path d="M32 15V150H210" fill="none" stroke="#8498a8"/><text x="28" y="155" textAnchor="end" fontSize="12">{base}</text><text x="28" y="24" textAnchor="end" fontSize="12">84</text>{[80,81,82].map((v,i)=><g key={i}><rect x={48+i*50} y={150-(v-base)/(84-base)*130} width="30" height={(v-base)/(84-base)*130} fill="#157c8c"/><text x={63+i*50} y={142-(v-base)/(84-base)*130} textAnchor="middle" fontSize="12">{v}</text></g>)}<text x="115" y="180" textAnchor="middle" fontSize="12">轴起点 {base} · 数值单位：分</text></svg>)}</div>;
 }else if(lessonId==='w05-d1'){
  title='从割线到局部切线';caption='独立图示：f(x)=x²，考察x=1。切线斜率为2；从1到2的割线斜率为3，平均变化率和局部变化率取的范围不同。';
  graphic=<Plot title={title} xLabel="输入 x" yLabel="输出 f(x)" series={[{name:'f(x)=x²',points:Array.from({length:21},(_,i)=>{const x=i/10;return [x,x*x]})},{name:'x=1处切线：2x−1',points:[[.5,0],[2,3]]},{name:'经过(1,1)、(2,4)的割线',points:[[1,1],[2,4]]}]} domain={[0,2,0,4]}/>;
 }else if(lessonId==='w05-d4'){
  title='步长改变后，更新轨迹会怎样？';caption='教学目标L(w)=w²，梯度2w，w₀=1；每步w乘以1−2η。η=.1同侧收敛，η=.75交替收敛，η=1.1振荡放大。';
  graphic=<Plot title={title} xLabel="更新步数" yLabel="参数 w" series={[.1,.75,1.1].map(eta=>({name:'η='+eta,points:Array.from({length:6},(_,i)=>[i,(1-2*eta)**i] as [number,number])}))}/>;
 }else if(lessonId==='w06-d3'){
  title='四种重采样怎样形成均值分布';caption='从[1,3]有放回抽两次，四个等概率序列为[1,1]、[1,3]、[3,1]、[3,3]，均值为1、2、2、3。均值2出现概率1/2，两端各1/4；这幅图尚不代表真实总体区间。';
  graphic=<Pixels title={title} values={[[.25,.5,.25]]} labels={ [['均值1：1/4','均值2：1/2','均值3：1/4']]}/>;
 }else if(lessonId==='w10-d2'){
  title='损失如何沿计算链返回';caption='前向依次产生预激活、激活和预测；反向从损失局部导数开始，乘局部雅可比并汇总路径。偏置、权重和输入梯度应分别核对形状。';
  graphic=<><Flow labels={['X','Z₁=XW₁+b₁','H=ReLU(Z₁)','P=HW₂+b₂','L']} caption={caption}/><Flow labels={['∂L/∂P','回传至H','乘激活导数','dW₁、db₁、dX']} caption={caption}/></>;
 }else if(lessonId==='w10-d4'){
  title='相同给定梯度下，动量保留了历史';caption='独立演算：w₀=1，学习率.1，给定梯度序列[2,−1,1]。SGD更新为[.8,.9,.8]；未归一化动量v=.8v+g、v₀=0，参数为[.8,.74,.592]。图中梯度预先给定。';
  graphic=<Plot title={title} xLabel="更新步数" yLabel="参数 w" series={[{name:'SGD',points:[[0,1],[1,.8],[2,.9],[3,.8]]},{name:'动量 μ=.8',points:[[0,1],[1,.8],[2,.74],[3,.592]]}]}/>;
 }else if(lessonId==='w12-d2'||lessonId==='w14-language-d4'){
  title='掩码之后，权重只分给合法位置';caption='当前位置为第2位，可见得分[0,ln3]，未来得分即使很高也被屏蔽。合法权重为[1/4,3/4,0]；若值为[2,10,100]，输出为8。';
  graphic=<Pixels title={title} values={[[.25,.75,0]]} labels={ [['位置1：0.25','位置2：0.75','未来：0']]}/>;
 }else if(lessonId==='w13-vision-d1'){
  title='同一幅图，可以对应三种输出';caption='整图类别说明图中是否有目标；框标注连续坐标范围；像素掩码逐格说明哪些位置属于目标。需要面积时，只知道整图类别或一个外接框都不够。';
  graphic=<><Flow labels={['同一幅图像','整图：有目标','框：位置与范围','掩码：逐像素归属']} caption={caption}/><Pixels title="三乘三教学掩码" values={[[0,1,0],[0,1,1],[0,0,0]]} labels={ [['0','1','0'],['0','1','1'],['0','0','0']]}/></>;
 }else if(lessonId==='w15-vision-d2'){
  title='概率图与阈值后的掩码';caption='四像素真值[1,0,1,0]，概率[.9,.4,.4,.1]；按p≥.5得到[1,0,0,0]。无平滑项soft-Dice=13/19，hard-Dice=2/3，计算对象不同。';
  graphic=<Pixels title={title} values={[[1,0,1,0],[.9,.4,.4,.1],[1,0,0,0]]} labels={ [['真1','真0','真1','真0'],['p=.9','p=.4','p=.4','p=.1'],['预测1','预测0','预测0','预测0']]}/>;
 }else if(lessonId==='w15-vision-d1'){
  title='拥挤目标：先匹配哪个真值会影响后续';caption='A=(0,0,2,2)，B=(1,0,3,2)。高分P₁=(.6,0,2.6,2)，对A的IoU=7/13，对B为2/3；最大IoU贪心先配B。低分P₂=B随后会成为重复检测。';
  graphic=<svg viewBox="0 0 420 250" role="img" aria-label={caption}><rect x="35" y="45" width="210" height="150" fill="#157c8c" fillOpacity=".1" stroke="#157c8c" strokeWidth="3"/><rect x="140" y="45" width="210" height="150" fill="#c36a35" fillOpacity=".1" stroke="#c36a35" strokeWidth="3"/><rect x="98" y="45" width="210" height="150" fill="none" stroke="#7259a0" strokeWidth="3" strokeDasharray="6 4"/><text x="35" y="30">真值A</text><text x="294" y="30">真值B / P₂</text><text x="110" y="220">虚线为高分P₁；横轴为连续框坐标</text></svg>;
 }else if(lessonId==='w15-timeseries-d3'){
  title='感受野跨度7，不代表使用了7个位置';caption='两层核长2、扩张分别为2与4的因果卷积，实际依赖t、t−2、t−4、t−6。首尾跨度7，只使用4个不同输入位置。';
  graphic=<Pixels title={title} values={[[1,0,1,0,1,0,1]]} labels={ [['t−6','t−5','t−4','t−3','t−2','t−1','t']]}/>;
 }else if(lessonId==='w15-timeseries-d4'){
  title='状态可以保留，梯度链可以被截断';caption='局部导数依次为.5和.8时，未截断链的乘积为.4。若在中间状态detach，后段损失对边界前状态的这条梯度为0，保留的状态数值仍可参与后续前向。';
  graphic=<Flow labels={['h₀','× .5','h₁ / detach边界','× .8','h₂ → 后段损失']} caption={caption}/>;
 }else if(lessonId==='w16-language-d2'||lessonId==='w15-vision-d5'){
  title='置信度与实际正确频率要一起看';caption='教学分箱：两个箱各10条，平均预测概率分别.3和.8，实际正类比例.4和.5。理想线y=x；高分箱高估.3。有限分箱有抽样波动，需报告每箱样本数。';
  graphic=<Plot title={title} xLabel="箱内平均预测概率" yLabel="箱内实际正类比例" domain={[0,1,0,1]} series={[{name:'理想校准',points:[[0,0],[1,1]]},{name:'两箱教学数据（各n=10）',points:[[.3,.4],[.8,.5]]}]}/>;
 }
 if(!graphic)return null;
 return <figure className="study-visual"><h3>{title}</h3>{graphic}<figcaption>{caption}</figcaption></figure>;
}
