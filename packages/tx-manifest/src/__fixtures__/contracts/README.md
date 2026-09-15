# Contract sources

Synthetic SimplicityHL sources for the `vaultlet` fixture. They are never compiled by anything
in this package — a wallet supplies the compiler, and every test here supplies a substitute for
it — so what they say matters only in that a reader can see which parameters each covenant
takes and why one of them can only be typed by the compiler.

`param::NAME` is written where a value is wanted and the type checker gives it the type that
position demands. There is no syntax here for declaring a parameter's type, which is why a
parameter wired to a bare value has to be typed by asking the compiler rather than by reading
this text.
