// Independently authored acceptance example for the supplied Hilega-Milega specification.
export const hilegaSource = `//@version=4
study("Hilega-Milega acceptance", overlay = false)
period = input(9, "RSI Length", type = input.integer, minval = 1)
src = input(close, "Source", type = input.source)
r = rsi(src, period)
fast = ema(r, 3)
slow = wma(r, 21)
plot(r, "RSI", color=color.blue, linewidth=2)
fastPlot = plot(fast, "EMA of RSI", color=color.aqua, linewidth=2)
slowPlot = plot(slow, "WMA of RSI", color=color.red)
hline(50, "Reference level", color=color.gray)
fill(fastPlot, slowPlot, fast >= slow ? color.aqua : color.red, transp=45)
`;
