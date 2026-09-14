#version 300 es
// Original procedural scene: desert, monumental steel gate, sunset and wind.
// Art direction follows the user's visual reference; no source image is sampled.
precision highp float;
uniform vec2 uResolution;
uniform float uTravel;
uniform float uJourney; // integrated city travel, independent of wind and caravan
uniform float uAxis; // React Flow main-axis height in screen coordinates
uniform vec2 uLook; // dust, brightness
out vec4 fragColor;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + 1.), f.x), f.y);
}
float fbm(vec2 p) {
    float sum = 0., amplitude = .5;
    for (int i = 0; i < 5; i++) { sum += noise(p) * amplitude; p = p * 2.03 + 12.7; amplitude *= .5; }
    return sum;
}

// Ray/box entry point and face normal. All world positions are independent of time.
void boxHit(vec3 ro, vec3 rd, vec3 lo, vec3 hi, inout float nearest, inout vec3 normal, inout float material, float id) {
    vec3 inv = 1. / (rd + vec3(.000001));
    vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
    vec3 mn = min(a,b), mx = max(a,b);
    float entry = max(max(mn.x,mn.y),mn.z), leave = min(min(mx.x,mx.y),mx.z);
    if (entry > 0. && entry < leave && entry < nearest) {
        nearest = entry; material = id;
        normal = -sign(rd) * step(mn.yzx,mn.xyz) * step(mn.zxy,mn.xyz);
    }
}

vec3 metal(vec3 p, vec3 n, float material) {
    vec2 uv = abs(n.x) > .5 ? p.zy : abs(n.y) > .5 ? p.xz : p.xy;
    // Wide vertical modules, inset plates, fine fins, conduits, warm window slits.
    vec2 cell = floor(uv * vec2(1.8,1.9));
    float section = hash(cell);
    vec2 tile = fract(uv * vec2(1.8,1.9));
    float seam = step(.022,tile.x) * step(.012,tile.y);
    float panel = .91 + .12 * section;
    float rib = pow(.5 + .5 * sin(uv.x * 63.), 14.);
    float duct = step(.89,fract(uv.x * 2.2)) * (.5 + .5 * noise(vec2(floor(uv.x*2.2),floor(uv.y*.12))));
    // Suppress subpixel metal details while moving, avoiding sparkling moire.
    float detail = 1.-smoothstep(.25,.85,max(fwidth(uv.x)*42.,fwidth(uv.y)*19.));
    float micro = mix(.5, hash(floor(uv * vec2(42.,19.))), detail);
    rib *= 1.-smoothstep(.8,2.8,fwidth(uv.x)*63.);
    vec3 col = mix(vec3(.028,.135,.225), vec3(.045,.19,.29), .35 + section*.3);
    col *= panel * (.83 + .17 * seam);
    col += rib * vec3(.017,.055,.07) + duct * vec3(.018,.043,.06);
    col *= .93 + .14 * micro;
    // Sun-facing side walls and thin exposed edges pick up the warm horizon.
    float facing = max(0.,dot(n,normalize(vec3(-.8,.3,-.5))));
    col += facing * vec3(.10,.055,.055);
    col += (1.-seam) * vec3(.012,.008,.018);
    float window = step(.87,hash(floor(uv * vec2(10.,5.))))
        * step(.26,fract(uv.x*10.)) * step(fract(uv.x*10.),.54)
        * step(.40,fract(uv.y*5.)) * step(fract(uv.y*5.),.51);
    window *= 1.-smoothstep(.7,1.6,max(fwidth(uv.x)*10.,fwidth(uv.y)*5.));
    col += window * vec3(.48,.20,.14) * (.3 + .7 * section);
    float scar = step(.78,noise(vec2(uv.x*.34,uv.y*1.6))) * step(.8,micro);
    col += scar * vec3(.12,.07,.045);
    if (material > 1.5) col *= .72;
    return col;
}

// Layered dune ridges: rounded windward shoulders, a steeper shaded slip face,
// and contour-following sand ripples. Crest silhouettes remain visible without
// relying on dust, while the caravan's horizontal route stays in an open valley.
vec3 duneLayer(vec3 behind, vec2 uv, float travel, float base, float height, float seed,
               vec3 shade, vec3 sunlight, float opacity) {
    float x = uv.x + travel;
    float ridge = base + height * (.56*sin(x*4.3+seed) + .28*sin(x*8.1+seed*1.7) + .12*sin(x*13.2+seed*.7));
    float aa = max(1.2/uResolution.y, fwidth(ridge));
    float cover = smoothstep(ridge-aa, ridge+aa, uv.y);
    float depth = max(0.,uv.y-ridge);
    float slope = clamp(depth/(height*2.7+.02),0.,1.);
    // An S-shaped lee face tapers down the shoulder, instead of a uniform band.
    float lee = smoothstep(-.10,.10,sin(x*4.3+seed+.6) - slope*1.5 + .15*sin(x*8.1+seed));
    float light = (.90 - slope*.28) * (1.-lee*.80);
    vec3 sand = mix(shade,sunlight,light);
    sand *= .96 + .06*noise(vec2(x*6.,slope*3.));
    float ripplePhase = depth*930. + x*21. + sin(x*13.+seed)*3.
        + noise(vec2(x*9.,depth*18.))*5.;
    float ripple = sin(ripplePhase) * (1.-smoothstep(.9,3.4,fwidth(ripplePhase)));
    sand += ripple * .006 * smoothstep(.003,.025,depth) * (1.-lee*.7);
    // A narrow reflected sunset highlights the edge, then rolls into the slope.
    sand += vec3(.15,.10,.055)*exp(-depth/.006)*(1.-lee*.65);
    return mix(behind,sand,cover*opacity);
}

void main() {
    vec2 screen = vec2(gl_FragCoord.x, uResolution.y-gl_FragCoord.y) / uResolution;
    vec2 viewport = screen;
    // The near ground is the actual task axis, just like the cloud railway.
    // Camera travel changes horizontal perspective, never the task-axis height.
    screen.y += .91 - uAxis;
    float aspect = uResolution.x/uResolution.y;
    // Keep the monumental doorway visible on portrait canvases as well.
    float lens = max(1.25, aspect);
    vec2 uv = vec2((screen.x-.5)*lens,screen.y);
    float wind = uTravel;


    vec3 sky = mix(vec3(.20,.29,.44),vec3(.85,.43,.48),smoothstep(.03,.65,screen.y));
    float glow = exp(-length(vec2(uv.x*.9,(screen.y-.45)*2.4))*2.6);
    sky += vec3(.38,.20,.07)*glow;
    float cloud = fbm(vec2(uv.x*3. + wind*.005 + uJourney*.004,screen.y*24. + noise(vec2(uv.x*4.,screen.y*8.))*2.));
    float streak = smoothstep(.34,.58,cloud) * exp(-pow((screen.y-.42)*5.0,2.));
    sky = mix(sky, vec3(1.,.63,.41), streak*.85);
    float darkCloud = smoothstep(.48,.62,cloud) * exp(-pow((screen.y-.32)*4.,2.));
    sky = mix(sky, vec3(.53,.34,.47), darkCloud*.5);
    sky = mix(sky, vec3(.91,.48,.53), smoothstep(.62,.87,screen.y)*.65);

    // Travel beside a repeating monumental city, rather than panning a flat
    // image or bouncing the camera back and forth. Repetition keeps the scene
    // populated during long work sessions; near and far geometry move in 3D.
    vec3 camera = vec3(-.6 + uJourney*.35,1.7,-18.);
    vec3 rd = normalize(vec3(uv.x*.90,(.79-screen.y)*.95,1.1));
    float gateCell = floor((camera.x + rd.x * (26. / rd.z) + 16.) / 32.);
    vec3 ro = camera - vec3(gateCell*32.,0.,0.);
    float nearest = 1e5, material = 0.;
    vec3 normal = vec3(0);
    boxHit(ro,rd,vec3(-16.,-1.,8.),vec3(-6.5,44.,28.),nearest,normal,material,1.);
    boxHit(ro,rd,vec3(7.,-1.,9.),vec3(16.,44.,30.),nearest,normal,material,1.);
    boxHit(ro,rd,vec3(-8.,24.,9.),vec3(8.,44.,27.),nearest,normal,material,1.);
    // Overlapping boundary buttresses seal neighboring districts at oblique
    // angles; otherwise a thin strip of sky could leak between ray-selected cells.
    boxHit(ro,rd,vec3(-18.,-1.,5.4),vec3(-14.2,44.,31.),nearest,normal,material,2.);
    boxHit(ro,rd,vec3(14.2,-1.,5.4),vec3(18.,44.,31.),nearest,normal,material,2.);
    // Deep tiered haunches turn the opening into an industrial arch, with
    // irregular hanging machinery silhouetted against the sunset.
    for (int i=0; i<16; i++) {
        float x = -6.5 + float(i)*.86;
        float arch = 23.6 - 5.2*pow(abs((x+.4)/7.),1.7);
        boxHit(ro,rd,vec3(x,arch,18.),vec3(x+.94,26.,27.5),nearest,normal,material,1.);
        float tooth = hash(vec2(float(i),8.));
        boxHit(ro,rd,vec3(x+.24,arch-.1-tooth*.25,26.8),vec3(x+.38,arch+.4,28.),nearest,normal,material,2.);
    }
    // Layered ribs and shorter under-lintel beams prevent a flat rectangular silhouette.
    for (int i=0;i<3;i++) {
        float x = float(i)*2.7;
        boxHit(ro,rd,vec3(-8.3-x,-.3,6.7),vec3(-7.8-x,39.,9.),nearest,normal,material,1.);
        boxHit(ro,rd,vec3(8.1+x,-.3,7.7),vec3(8.5+x,39.,10.),nearest,normal,material,1.);
        float top = 27.2 + hash(vec2(float(i),5.))*.65;
        boxHit(ro,rd,vec3(-6.5+float(i)*1.5,top,9.6),vec3(-5.4+float(i)*1.5,29.,11.2),nearest,normal,material,2.);
    }
    // Massive stepped feet disappear into the ground haze.
    boxHit(ro,rd,vec3(-16.,-1.,5.8),vec3(-7.,1.1,28.),nearest,normal,material,2.);
    boxHit(ro,rd,vec3(7.6,-1.,6.8),vec3(16.,1.1,30.),nearest,normal,material,2.);
    // Fine buttresses and base terraces catch light without a repeating grid.
    for (int i=0; i<7; i++) {
        float h = float(i)*.34;
        float inset = float(i)*.33;
        boxHit(ro,rd,vec3(-16.,h,3.9+inset),vec3(-7.5-inset,h+.38,12.),nearest,normal,material,1.);
        boxHit(ro,rd,vec3(8.+inset,h,4.9+inset),vec3(16.,h+.38,13.),nearest,normal,material,1.);
    }
    // A second, more distant city layer has a slower apparent speed.
    float farCell = floor((camera.x + rd.x * (113. / rd.z) + 21.) / 42.);
    ro = camera - vec3(farCell*42.,0.,0.);
    boxHit(ro,rd,vec3(5.,-.5,95.),vec3(10.,11.,103.),nearest,normal,material,3.);
    boxHit(ro,rd,vec3(7.,10.,97.),vec3(7.9,19.,99.),nearest,normal,material,3.);
    boxHit(ro,rd,vec3(6.,9.,95.8),vec3(9.8,11.5,102.),nearest,normal,material,3.);
    boxHit(ro,rd,vec3(4.2,0.,96.),vec3(6.,7.,102.),nearest,normal,material,3.);
    boxHit(ro,rd,vec3(6.2,10.,96.),vec3(7.4,15.,98.),nearest,normal,material,3.);
    boxHit(ro,rd,vec3(8.6,10.,98.),vec3(9.3,13.,100.),nearest,normal,material,3.);

    vec3 col = sky;
    ro = camera;
    float ground = (-.15-ro.y)/rd.y;
    if (ground > 0. && ground < nearest) {
        vec3 p = ro + rd*ground;
        float dune = fbm(p.xz*.055);
        float sand = noise(p.xz*5.);
        float ripples = sin(p.z*6. + fbm(p.xz*.8)*9.);
        col = mix(vec3(.18,.235,.32),vec3(.46,.38,.40),dune);
        col += sand*.025 + ripples*.008;
        col += vec3(.08,.026,.016)*exp(-abs(p.x)*.07);
        col = mix(col,vec3(.57,.45,.54),1.-exp(-ground*.007));
    } else if (material > 0.) {
        vec3 p = ro+rd*nearest;
        col = metal(p,normal,material);
        float distanceFog = 1.-exp(-nearest*.004);
        float floorFog = exp(-max(0.,p.y)*.35) * .46;
        col = mix(col,vec3(.53,.40,.52),max(distanceFog,floorFog));
        if (material > 2.5) col = mix(col,sky,.64);
    }
    // Cool distant dunes merge into the giant city's haze. Broad middle dunes
    // end before y=.91, reserving a level passage for the graph's caravan axis.
    col = duneLayer(col,uv,uJourney*.005,.795,.036,1.6,
        vec3(.25,.31,.41),vec3(.48,.47,.53),.94);
    float valley = 1.-smoothstep(.87,.91,screen.y);
    col = duneLayer(col,uv,uJourney*.011,.835,.052,4.3,
        vec3(.25,.28,.37),vec3(.64,.49,.41),valley);
    // The near dune begins below the road: larger ridges, warmer light and
    // stronger relief make the foreground read as sand rather than a flat floor.
    col = duneLayer(col,uv,uJourney*.022,1.055,.082,.8,
        vec3(.28,.27,.35),vec3(.73,.54,.39),1.);
    float mist = fbm(vec2(uv.x*2.8+wind*.055+uJourney*.018, screen.y*9.+wind*.005));
    float lowMist = exp(-pow((screen.y-.78)*8.,2.));
    float drifting = exp(-pow((screen.y-.9)*12.,2.))*smoothstep(.26,.73,fbm(vec2(uv.x*5.+wind*.20+uJourney*.05,screen.y*24.)));
    col = mix(col,vec3(.64,.51,.59),clamp((lowMist*(.12+mist*.34)+drifting*.22)*uLook.x,0.,.72));
    // Airborne grains follow the faster near-ground flow.
    vec2 grainPos = vec2(uv.x*130.+wind*7.+uJourney*.7,screen.y*83.);
    float grain = step(.996,hash(floor(grainPos))) * exp(-length(fract(grainPos)-.5)*10.);
    col += grain*vec3(.5,.32,.23)*smoothstep(.60,.9,screen.y)*uLook.x;
    col *= .91 + .09*pow(max(0.,16.*viewport.x*viewport.y*(1.-viewport.x)*(1.-viewport.y)),.25);
    fragColor = vec4(col*uLook.y,1.);
}
