# Visualisation des incertitudes

## Objectif

Montrer les limites sans donner une fausse impression de précision.

## Types

- confiance de détection ;
- ambiguïté visuelle ;
- abstention ;
- qualité des correspondances ;
- stabilité de pose ;
- `uncertainty_envelope` ;
- contradictions textuelles ;
- ancienneté des données.

## Règles visuelles

- ne pas afficher un point précis lorsque seule une zone est défendable ;
- afficher la méthode et la révision ;
- distinguer estimation et observation ;
- expliquer les reason codes ;
- éviter les pourcentages non calibrés ;
- ne pas appeler une enveloppe « intervalle de confiance » sans calibration ;
- conserver une alternative textuelle accessible.

## États

- disponible ;
- limité ;
- en revue ;
- abstention ;
- contradictoire ;
- indisponible ;
- retiré.

## Viewer 3D

La géométrie essentielle doit rester compréhensible sans WebGL. Le viewer ne masque pas les limites du référentiel.
