/** Independent tool descriptions; no vendor artwork or proprietary geometry. */
export type DrawingKind='trend'|'ray'|'info_line'|'extended'|'trend_angle'|'horizontal'|'horizontal_ray'|'vertical'|'crossline'|'parallel_channel'|'regression_channel'|'flat_channel'|'disjoint_channel'|'rectangle'|'text'|'note'|'price_note'|'fib_retracement'|'fib_extension'|'price_range'|'date_range'|'date_price_range'|'ruler'|'arrow'|'arrow_marker'|'arrow_up'|'arrow_down'|'circle'|'ellipse'|'triangle'|'polyline'|'pitchfork'|'schiff_pitchfork'|'modified_schiff'|'inside_pitchfork'|'fib_channel'|'fib_time_zone'|'fib_speed_fan'|'fib_trend_time'|'fib_circles'|'fib_spiral'|'fib_arcs'|'fib_wedge'|'pitchfan'|'gann_box'|'gann_square_fixed'|'gann_square'|'gann_fan'|'xabcd'|'cypher'|'head_shoulders'|'abcd'|'triangle_pattern'|'three_drives'|'elliott_impulse'|'elliott_correction'|'elliott_triangle'|'elliott_double'|'elliott_triple'|'cyclic_lines'|'time_cycles'|'sine_line'|'brush'|'highlighter'|'rotated_rectangle'|'path'|'arc'|'curve'|'double_curve'|'callout'|'comment'|'pin'|'price_label'|'signpost'|'flag_mark'|'table'|'image'|'long_position'|'short_position'|'position_forecast'|'bars_pattern'|'ghost_feed'|'sector'|'anchored_vwap'|'fixed_volume_profile'|'anchored_volume_profile';
export type DrawingTool='cursor'|DrawingKind;
export type Category='lines'|'fibonacci'|'patterns'|'forecast'|'shapes'|'text'|'measure';
export interface Parameter {key:string;label:string;type:'number'|'text'|'boolean'|'levels'|'image'|'long_position'|'short_position'|'position_forecast'|'bars_pattern'|'ghost_feed'|'sector'|'anchored_vwap'|'fixed_volume_profile'|'anchored_volume_profile';min?:number;max?:number;default:number|string|boolean|{ratio:number}[];description?:string}
export interface ToolDefinition {id:string;name:string;category:Category;group:string;anchors:number;variable?:boolean;maxAnchors?:number;gesture?:'freehand';enabled:boolean;stage:number;shortcut?:string;parameters:Parameter[];description:string}
export const categories:{id:Category;name:string}[]=[{id:'lines',name:'Lines and Channels'},{id:'fibonacci',name:'Fibonacci and Gann'},{id:'patterns',name:'Patterns and Elliott Waves'},{id:'forecast',name:'Forecasting and Measurements'},{id:'shapes',name:'Brushes, Arrows and Shapes'},{id:'text',name:'Text and Notes'},{id:'measure',name:'Zoom and Measurement'}];
const enabled=(id:DrawingKind,name:string,category:Category,group:string,anchors:number,description:string,parameters:Parameter[]=[],shortcut?:string):ToolDefinition=>({id,name,category,group,anchors,enabled:true,stage:1,description,parameters,shortcut});
const channelWidth:Parameter={key:'channel_width',label:'Channel width (price units; 0 = anchor/auto)',type:'number',min:0,max:1e12,default:0};
const textParameters:Parameter[]=[{key:'text',label:'Annotation text',type:'text',default:'Text'},{key:'font_size',label:'Font size',type:'number',min:8,max:48,default:14},{key:'offset_x',label:'Text offset X',type:'number',min:-500,max:500,default:8},{key:'offset_y',label:'Text offset Y',type:'number',min:-500,max:500,default:-12}];
const fibParameters:Parameter[]=[{key:'levels',label:'Fibonacci levels',type:'levels',default:[0,.236,.382,.5,.618,.786,1].map(ratio=>({ratio}))},{key:'reverse',label:'Reverse direction',type:'boolean',default:false},{key:'extend_left',label:'Extend left',type:'boolean',default:false},{key:'extend_right',label:'Extend right',type:'boolean',default:true},{key:'labels',label:'Level labels and prices',type:'boolean',default:true}];
const stage2=(...args:Parameters<typeof enabled>):ToolDefinition=>({...enabled(...args),stage:2});
const stage3=(...args:Parameters<typeof enabled>):ToolDefinition=>({...enabled(...args),stage:3});
const stage4=(...args:Parameters<typeof enabled>):ToolDefinition=>({...enabled(...args),stage:4});
const number=(key:string,label:string,value:number,min:number,max:number):Parameter=>({key,label,type:'number',default:value,min,max});
const bool=(key:string,label:string,value:boolean):Parameter=>({key,label,type:'boolean',default:value});
const string=(key:string,label:string,value:string):Parameter=>({key,label,type:'text',default:value});
const positionParameters:Parameter[]=[number('price_precision','Price precision (-1 = instrument)',-1,-1,10),number('account_size','Account size',100000,0,1e15),number('risk_percent','Account risk (%)',1,0,100),number('position_size','Manual quantity',1,0,1e12),bool('auto_size','Calculate quantity from risk',true),number('unit_multiplier','Cash per price point per unit',1,1e-12,1e12),number('lot_step','Quantity increment / lot step',1,1e-12,1e12),number('money_rate','Quote to display currency rate',1,1e-12,1e12),string('display_currency','Account / display currency (blank = quote currency)',''),bool('sizing_confirmed','Confirm multiplier, lot step and currency rate',false),string('bull_color','Reward / bullish color','#37c5a2'),string('bear_color','Risk / bearish color','#ee6a79')];
const profileParameters:Parameter[]=[number('bins','Price bins',24,2,128),number('value_area','Value area (%)',70,1,100),number('histogram_width','Histogram width (%)',40,1,100),bool('profile_left','Histogram on left',false),bool('show_histogram','Show histogram',true),bool('show_poc','Show POC',true),bool('show_value_area','Show VAH / VAL',true),string('bull_color','Value area color','#37c5a2'),string('bear_color','Outside value area color','#64748b')];
const ratios=(values:number[],label='Ratios'):Parameter=>({key:'levels',label,type:'levels',default:values.map(ratio=>({ratio}))});
const labels:Parameter={key:'labels',label:'Show labels',type:'boolean',default:true};
const metric:Parameter[]=[{key:'price_unit',label:'Price unit',type:'number',min:1e-10,max:1e12,default:1},{key:'bar_unit',label:'Trading-bar unit',type:'number',min:1e-6,max:1e6,default:1}];
export const tools:ToolDefinition[]=[
 enabled('trend','Trendline','lines','Lines',2,'Two financial anchors; straight segment in the chart’s transformed price scale.',[],'Alt+T'),
 enabled('ray','Ray','lines','Lines',2,'Starts at anchor 1 and continues through anchor 2, clipped to the plot.'),
 enabled('info_line','Info Line','lines','Lines',2,'Trend segment with price change, percentage, elapsed time and actual trading-bar count.'),
 enabled('extended','Extended Line','lines','Lines',2,'Line through two anchors extending in both directions, clipped to the plot.'),
 enabled('trend_angle','Trend Angle','lines','Lines',2,'atan2(price change / price unit, trading bars / bar unit). This data-space angle is independent of screen zoom.',[{key:'price_unit',label:'Angle price unit',type:'number',min:1e-10,max:1e12,default:1},{key:'bar_unit',label:'Angle trading-bar unit',type:'number',min:1e-6,max:1e6,default:1}]),
 enabled('horizontal','Horizontal line','lines','Lines',1,'Constant financial price across the plot.',[],'Alt+H'),
 enabled('horizontal_ray','Horizontal Ray','lines','Lines',1,'Constant price from the anchor towards later bars.',[],'Alt+J'),
 enabled('vertical','Vertical line','lines','Lines',1,'Constant timestamp across the plot.',[],'Alt+V'),
 enabled('crossline','Crossline','lines','Lines',1,'Horizontal price line and vertical time line sharing one anchor.',[],'Alt+C'),
 enabled('parallel_channel','Parallel Channel','lines','Channels',3,'Raw-price slope over trading-bar indices; third anchor supplies a parallel price offset.',[channelWidth]),
 enabled('regression_channel','Regression Trend Channel','lines','Channels',2,'OLS of actual closes in the selected bars; residual population standard deviation supplies the band width. Drag endpoint times to change/refit the range; price fields are not regression inputs.',[channelWidth,{key:'deviation',label:'Residual deviation multiplier',type:'number',min:.01,max:10,default:2}]),
 enabled('flat_channel','Flat Top/Bottom Channel','lines','Channels',3,'A sloping boundary through two anchors and a horizontal boundary at the third anchor’s price.',[channelWidth]),
 enabled('disjoint_channel','Disjoint Channel','lines','Channels',4,'Two independently anchored boundary segments; shaded region connects their endpoints.',[channelWidth]),
 enabled('rectangle','Rectangle','shapes','Shapes',2,'Two opposite financial corners.'),
 enabled('text','Text','text','Text and Notes',1,'Plain text rendered on canvas; no HTML or script execution.',textParameters),
 enabled('note','Note','text','Text and Notes',1,'Plain text note with a bounded background and a financial anchor.',textParameters),
 enabled('price_note','Price Note','text','Text and Notes',1,'Financial price and original instrument currency, with optional plain text.',textParameters),
 stage2('fib_retracement','Fibonacci Retracement','fibonacci','Fibonacci',2,'P0 + ratio × (P1 − P0); reverse swaps P0/P1. Levels use financial prices before chart scaling.',fibParameters,'Alt+F'),
 stage2('fib_extension','Trend-Based Fibonacci Extension','fibonacci','Fibonacci',3,'P2 + ratio × (P1 − P0); reverse projects the opposite signed impulse.',fibParameters.map(p=>p.key==='levels'?{...p,default:[0,.618,1,1.618,2,2.618].map(ratio=>({ratio}))}:p)),
 ...(['price_range','date_range','date_price_range','ruler'] as const).map((k,i)=>stage2(k,['Price Range','Date Range','Date and Price Range','Ruler'][i],i===3?'measure':'forecast','Measurements',2,'Financial start/end prices, signed difference, percentage relative to absolute starting price, elapsed time and inclusive supplied trading-bar count. Zero base: percentage undefined.')),
 stage2('arrow','Arrow','shapes','Arrows',2,'Financial endpoints with an arrowhead at the ending anchor.'),
 ...(['arrow_marker','arrow_up','arrow_down'] as const).map((k,i)=>stage2(k,['Arrow Marker','Arrow Mark Up','Arrow Mark Down'][i],'shapes','Arrows',1,'Financial anchor with a configurable pixel-size marker.',[{key:'marker_size',label:'Marker size',type:'number',min:8,max:80,default:22}])),
 stage2('circle','Circle','shapes','Shapes',2,'Center and radius anchors; screen-space circle follows both financial anchors.'),
 stage2('ellipse','Ellipse','shapes','Shapes',2,'Opposite financial corners of a screen-space ellipse.'),
 stage2('triangle','Triangle','shapes','Shapes',3,'Three independently editable financial vertices.'),
 {...stage2('polyline','Polyline','shapes','Shapes',2,'Click 2–32 financial vertices; Enter or Finish polyline completes placement.'),variable:true},

 ...(['pitchfork','schiff_pitchfork','modified_schiff','inside_pitchfork'] as const).map((id,i)=>stage3(id,['Standard Pitchfork','Schiff Pitchfork','Modified Schiff Pitchfork','Inside Pitchfork'][i],'lines','Pitchforks',3,'Three financial anchors. Original A→mid(B,C); Schiff (Ax,mid(Ay,By))→mid(B,C); Modified mid(A,B)→mid(B,C); Inside mid(A,B)→C. Parallel levels interpolate the side-anchor offsets.',[ratios([-1,-.5,0,.5,1],'Pitchfork levels'),labels,...fibParameters.filter(p=>['extend_left','extend_right'].includes(p.key))])),
 stage3('fib_channel','Fibonacci Channel','fibonacci','Fibonacci',3,'Base price slope A→B; C supplies the signed vertical offset. Level r = base + r×offset.',[ratios([0,.236,.382,.5,.618,1,1.618]),labels,...fibParameters.filter(p=>p.key.startsWith('extend_'))]),
 stage3('fib_time_zone','Fibonacci Time Zone','fibonacci','Fibonacci',2,'Vertical lines at bar(A)+r×(bar(B)−bar(A)); projected bars have no invented calendar dates.',[ratios([0,1,2,3,5,8,13,21]),labels]),
 stage3('fib_trend_time','Trend-Based Fibonacci Time','fibonacci','Fibonacci',3,'Vertical lines at bar(C)+r×(bar(B)−bar(A)).',[ratios([0,.618,1,1.618,2,2.618]),labels]),
 stage3('fib_speed_fan','Fibonacci Speed Resistance Fan','fibonacci','Fibonacci',2,'Rays from A towards (bar(B), price(A)+r×(price(B)−price(A))).',[ratios([.382,.5,.618,1]),labels]),
 stage3('pitchfan','Pitchfan','fibonacci','Fibonacci',3,'Rays from A to B+r×(C−B) in financial price/bar space.',[ratios([0,.236,.382,.5,.618,.786,1]),labels]),
 ...(['fib_circles','fib_arcs','fib_wedge'] as const).map((id,i)=>stage3(id,['Fibonacci Circles','Fibonacci Speed Resistance Arcs','Fibonacci Wedge'][i],'fibonacci','Fibonacci',2,'Metric circles/arcs centered at A, radii r×distance(A,B) in explicit price/bar units. Arcs use the baseline-centered half circle; wedge uses an editable angular aperture.',[ratios([.382,.5,.618,1,1.618]),labels,...metric,...(id==='fib_wedge'?[{key:'aperture',label:'Wedge aperture (degrees)',type:'number' as const,min:1,max:360,default:90}]:[])])),
 stage3('fib_spiral','Fibonacci Spiral','fibonacci','Fibonacci',2,'Golden logarithmic spiral in normalized price/bar space: radius grows by φ every quarter turn, anchored so radius at angle zero reaches B. This documented approximation is not a vendor-specific tiling implementation.',[...metric,{key:'turns',label:'Spiral turns',type:'number',min:.25,max:4,default:2},{key:'reverse',label:'Reverse spiral winding',type:'boolean',default:false},labels]),

 stage3('gann_box','Gann Box','fibonacci','Gann',2,'Two financial corners divided by configurable time/price fractions. The box shows its observed price/bar ratio.',[ratios([0,.25,.5,.75,1],'Grid fractions'),labels]),
 ...(['gann_square_fixed','gann_square','gann_fan'] as const).map((id,i)=>stage3(id,['Gann Square Fixed','Gann Square','Gann Fan'][i],'fibonacci','Gann',2,'Set and confirm price per trading bar. Fixed Square derives price height from the selected bar span; Square retains the selected box and explicit calibrated rays; Fan projects r×price-per-bar. Financial ratios never depend on screen angles.',[{key:'price_per_bar',label:'Price per trading bar',type:'number',min:1e-10,max:1e12,default:1},{key:'calibrated',label:'Confirm price/bar calibration',type:'boolean',default:false},ratios(id==='gann_fan'?[.125,.25,.5,1,2,4,8]:[0,.25,.5,.75,1],'Gann ratios'),{key:'reverse',label:'Reverse price direction',type:'boolean',default:false},labels])),
 ...([{id:'xabcd',name:'XABCD Pattern',anchors:5},{id:'cypher',name:'Cypher Pattern',anchors:5},{id:'head_shoulders',name:'Head and Shoulders',anchors:7},{id:'abcd',name:'ABCD Pattern',anchors:4},{id:'triangle_pattern',name:'Triangle Pattern',anchors:5},{id:'three_drives',name:'Three Drives Pattern',anchors:7}] as const).map(t=>stage3(t.id,t.name,'patterns','Chart Patterns',t.anchors,'Manual financial swing template. Drag each labelled vertex; optional absolute adjacent-leg price ratios are measurements, not automatic pattern validation.',[labels,{key:'show_ratios',label:'Show adjacent-leg ratios',type:'boolean',default:true}])),

 ...([{id:'elliott_impulse',name:'Elliott Impulse Wave (1-2-3-4-5)',anchors:6},{id:'elliott_correction',name:'Elliott Correction Wave (A-B-C)',anchors:4},{id:'elliott_triangle',name:'Elliott Triangle Wave (A-B-C-D-E)',anchors:6},{id:'elliott_double',name:'Elliott Double Combo (W-X-Y)',anchors:4},{id:'elliott_triple',name:'Elliott Triple Combo (W-X-Y-X-Z)',anchors:6}] as const).map(t=>stage3(t.id,t.name,'patterns','Elliott Waves',t.anchors,'Manual wave sequence including the starting anchor; labels do not assert Elliott rule compliance.',[labels,{key:'show_ratios',label:'Show adjacent-leg ratios',type:'boolean',default:false}])),
 stage3('cyclic_lines','Cyclic Lines','patterns','Cycles',2,'Vertical lines at A+n×(bar(B)−bar(A)); period uses trading bars. At most 256 visible repetitions.',[labels]),
 stage3('time_cycles','Time Cycles','patterns','Cycles',2,'Repeated financial semiellipses: period is |bar(B)−bar(A)|; height is |price(B)−price(A)|. Bar/price geometry follows chart transforms.',[labels]),
 stage3('sine_line','Sine Line','patterns','Cycles',3,'Baseline price A, full-cycle trading-bar period A→B, signed amplitude C.price−A.price. Phase is in degrees.',[labels,{key:'phase',label:'Sine phase (degrees)',type:'number',min:-360,max:360,default:0}]),

 ...(['brush','highlighter'] as const).map((id,i)=>({...stage3(id,['Brush','Highlighter'][i],'shapes','Brushes',2,'Drag to capture a bounded financial-anchor stroke (up to 512 points).',id==='highlighter'?[{key:'stroke_size',label:'Highlight stroke size',type:'number',min:4,max:40,default:16}]:[]),variable:true,maxAnchors:512,gesture:'freehand' as const})),
 stage3('rotated_rectangle','Rotated Rectangle','shapes','Shapes',3,'A→B is the base; C defines its perpendicular height in explicit price/bar units. Derived corners are financial vectors.',metric),
 {...stage3('path','Path','shapes','Shapes',2,'Click 2–32 financial vertices; Enter finishes. Optional endpoint arrow.',[{key:'arrowhead',label:'Endpoint arrow',type:'boolean',default:true}]),variable:true},
 stage3('arc','Arc','shapes','Shapes',3,'Circumcircle arc through A,B,C in explicit price/bar units; collinear points use their straight-line limit.',metric),
 stage3('curve','Curve','shapes','Shapes',3,'Quadratic Bézier: A and C endpoints, B financial control anchor.'),
 stage3('double_curve','Double Curve','shapes','Shapes',4,'Cubic Bézier: A/D endpoints and B/C financial controls.'),
 ...([{id:'callout',name:'Callout',anchors:2},{id:'comment',name:'Comment',anchors:1},{id:'pin',name:'Pin',anchors:1},{id:'price_label',name:'Price Label',anchors:1},{id:'signpost',name:'Signpost',anchors:1},{id:'flag_mark',name:'Flag Mark',anchors:1}] as const).map(t=>stage3(t.id,t.name,'text','Text and Notes',t.anchors,'Plain canvas text anchored to financial time/price; no HTML, scripting or remote content.',textParameters)),
 stage3('table','Table','text','Text and Notes',2,'Financial bounding corners, up to 20 rows × 10 columns. Separate cells with | or tabs, rows with newlines; plain text only.',[{...textParameters[0],default:'Metric|Value\nScenario|Note'},{...textParameters[1],default:12}]),
 stage3('image','Local Image Annotation','text','Local Content',2,'Two financial corners. Select a local PNG/JPEG through the native dialog; normalized PNG ≤128 KiB and ≤1024×1024. Embedded bounded PNG is persisted/exported with the drawing, without file paths or executable content.',[{key:'image_data',label:'Local image',type:'image',default:''}]),

 ...(['long_position','short_position'] as const).map((id,i)=>stage4(id,['Long Position','Short Position'][i],'forecast','Positions',3,'Click entry, stop, target. Financial prices drive risk/reward; quantity and P&L require explicit multiplier, lot and currency confirmation. No fees, slippage or order execution.',positionParameters)),
 {...stage4('position_forecast','Position Forecast','forecast','Forecasting',2,'User-created hypothetical path: click 2–32 financial positions, then Enter. Target time/price and every waypoint are editable; no predicted market data.',[string('text','Scenario label','My scenario'),string('bull_color','Bullish color','#37c5a2'),string('bear_color','Bearish color','#ee6a79')]),variable:true},
 stage4('bars_pattern','Bars Pattern','forecast','Forecasting',3,'Click historical range start/end, then projection origin. Copies at most 256 already fetched bars; projected candles are a hypothetical overlay and never enter indicators or history.',[number('scale_factor','Price scale factor',1,.001,1000),number('bar_scale','Trading-bar scale factor',1,.01,100),number('displacement','Projection price displacement',0,-1e12,1e12)]),
 stage4('ghost_feed','Ghost Feed','forecast','Forecasting',1,'Manual hypothetical OHLC offsets relative to the financial anchor. Each row: trading-bar offset, openΔ, highΔ, lowΔ, closeΔ. Up to 128 candles; no volume or real market feed.',[string('ghost_bars','Hypothetical candles (bar, openΔ, highΔ, lowΔ, closeΔ)','0,0,2,-1,1\n1,1,3,0,2\n2,2,3,0,1'),string('bull_color','Bullish color','#37c5a2'),string('bear_color','Bearish color','#ee6a79')]),
 stage4('sector','Sector','shapes','Shapes',2,'Financial center and radius anchors in explicit price/bar units; baseline angle plus editable angular span. All vector samples use chart price transforms.',[...metric,number('sector_angle','Angular range (degrees)',90,-360,360)]),
 stage4('anchored_vwap','Anchored VWAP','forecast','Volume-Based',1,'Cumulative volume-weighted bar price from the anchor through the visible replay prefix. HLC3 default. Weighted population deviation bands. Bar-derived approximation, not trade VWAP. Missing/invalid volume rejects the range; zero-volume bars add no weight.',[string('price_source','Price source (HLC3 / O / H / L / C / HL2 / OHLC4)','HLC3'),number('bands','Deviation band multiplier (0 = none)',0,0,10),ratios([0],'Deviation band multipliers'),bool('fill_bands','Fill outer deviation bands',false)]),
 stage4('fixed_volume_profile','Fixed Range Volume Profile','forecast','Volume-Based',2,'Estimated OHLCV Volume Profile: selected inclusive range. Volume allocated uniformly by candle-range overlap with price bins; zero-range candles go into one bin. Contiguous value area grows from POC until its target is met. Not exact volume at price.',profileParameters),
 stage4('anchored_volume_profile','Anchored Volume Profile','forecast','Volume-Based',1,'Estimated OHLCV Volume Profile: anchor through last available replay candle; same approximate allocation and value-area engine as fixed range.',profileParameters),
];
function unavailable(category:Category,group:string,names:string[],stage:number){for(const name of names)tools.push({id:'pending_'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_'),name,category,group,anchors:0,enabled:false,stage,parameters:[],description:`Unavailable — planned for Stage ${stage}; no drawing is created.`});}

















export const toolRegistry=new Map(tools.map(t=>[t.id,t]));
export const implementedTools=tools.filter(t=>t.enabled);
export function definition(kind:DrawingKind){return toolRegistry.get(kind)!;}
export function parametersFor(kind:DrawingKind){return Object.fromEntries(definition(kind).parameters.map(p=>[p.key,structuredClone(p.default)]));}
