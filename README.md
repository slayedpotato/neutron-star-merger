# Neutron Star Merger Simulator

An interactive browser-based visualization of the time evolution of a binary neutron star merger. The simulation follows the system from inspiral through merger, remnant formation, relativistic outflows, kilonova emission, black hole formation, and the late X-ray and radio afterglow.

## Live features

- Interactive 3D orbit controls with persistent zoom and camera position
- Draggable physical timeline
- Inspiral, tidal deformation, merger, and post-merger evolution
- Temporary hypermassive neutron-star remnant
- Black hole and accretion-disk formation
- Relativistic polar outflows and gamma-ray burst
- Blue and red kilonova evolution
- Expanding merger ejecta and heavy-element production
- Gravitational-wave and electromagnetic plots
- Human-friendly Learn panel
- Adjustable masses, equation of state, magnetic field, spin, inclination, and distance

## Project structure

```text
neutron-star-merger-simulator/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── main.js
│   ├── constants.js
│   └── educationalContent.js
├── assets/
│   └── favicon.svg
├── LICENSE
├── README.md
└── .gitignore
```

## Run locally

Because the project uses JavaScript modules, open it through a local web server rather than double-clicking `index.html`.

### Python

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

### VS Code

Install the **Live Server** extension, right-click `index.html`, and select **Open with Live Server**.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload the contents of this project folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder.
6. Save. GitHub will provide a public URL similar to:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

No build step or API key is required.

## Scientific scope

The simulator is physics-informed and inspired by the multi-messenger observations of GW170817. Spatial scales, durations, brightness, wave amplitudes, and some transitions are visually amplified or compressed so that processes spanning milliseconds to years can be explored in one interface. It is an educational visualization, not a numerical-relativity calculation or a parameter-estimation tool.

## Main technologies

- HTML5 and CSS3
- JavaScript ES modules
- Three.js
- Three.js OrbitControls and post-processing
- Canvas-based scientific plots

## Credits

Created by Ashutosh Kumar as an educational multi-messenger astrophysics project.

## License

Released under the MIT License. See [LICENSE](LICENSE).
