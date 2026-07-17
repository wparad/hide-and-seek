export interface Station {
  name: string
  coordinates: [number, number]
  lines: string[]
  apiNames?: string[]
}

/** Non-station points of interest. Coordinates are [lng, lat] sourced from Google Maps. */
export interface Location {
  name: string
  coordinates: [number, number]
  symbol: string
}

export const locations: Location[] = [
  { name: 'Zürich Airport', coordinates: [8.550869, 47.461705], symbol: '✈️' },
]

export const stations: Station[] = [
  { name: 'Aathal', coordinates: [8.7661516, 47.3356571], lines: ['S14'] },
  { name: 'Adliswil', coordinates: [8.5241966, 47.3123128], lines: ['S4'] },
  { name: 'Affoltern am Albis', coordinates: [8.4464709, 47.2760914], lines: ['S5', 'S14'] },
  { name: 'Andelfingen', coordinates: [8.6774724, 47.5936991], lines: ['S12', 'S24', 'S33'] },
  { name: 'Au ZH', coordinates: [8.6440321, 47.2469193], lines: ['S8'] },
  { name: 'Bassersdorf', coordinates: [8.6261896, 47.4384866], lines: ['S7', 'S24'] },
  { name: 'Bauma', coordinates: [8.8783122, 47.3688843], lines: ['S26'] },
  { name: 'Bergfrieden', coordinates: [8.3988608, 47.3974091], lines: ['S17'] },
  { name: 'Birmensdorf ZH', coordinates: [8.4375314, 47.3575203], lines: ['S5', 'S14'] },
  { name: 'Bonstetten-Wettswil', coordinates: [8.4679666, 47.3262104], lines: ['S5', 'S14'] },
  { name: 'Bubikon', coordinates: [8.8227427, 47.2709342], lines: ['S5', 'S14', 'S15'] },
  { name: 'Buchs-Dällikon', coordinates: [8.4369187, 47.453237], lines: ['S6'] },
  { name: 'Burghalden', coordinates: [8.6926797, 47.2086978], lines: ['S13'] },
  { name: 'Bäch SZ', coordinates: [8.7270601, 47.2008744], lines: ['S8'] },
  { name: 'Bülach', coordinates: [8.5361081, 47.5239192], lines: ['S3', 'S9', 'S36', 'S41'] },
  { name: 'Dachsen', coordinates: [8.6139493, 47.6667567], lines: ['S12', 'S33'] },
  { name: 'Dielsdorf', coordinates: [8.4596548, 47.482314], lines: ['S15'] },
  {
    name: 'Dietikon',
    coordinates: [8.4051334, 47.4058556],
    lines: ['S11', 'S12', 'S17', 'S19', 'S42'],
  },
  { name: 'Dietikon Stoffelbach', coordinates: [8.3988448, 47.3934346], lines: ['S17'] },
  { name: 'Dietlikon', coordinates: [8.6194099, 47.4202433], lines: ['S3', 'S8', 'S12', 'S19'] },
  { name: 'Dinhard', coordinates: [8.7527973, 47.5531409], lines: ['S29'] },
  { name: 'Dübendorf', coordinates: [8.6234706, 47.4003179], lines: ['S9', 'S14'] },
  { name: 'Egg', coordinates: [8.6893498, 47.3019316], lines: ['S18'] },
  {
    name: 'Effretikon',
    coordinates: [8.6871202, 47.4261087],
    lines: ['S3', 'S7', 'S8', 'S19', 'S24'],
  },
  { name: 'Eglisau', coordinates: [8.5155152, 47.5725152], lines: ['S9', 'S36'] },
  { name: 'Elgg', coordinates: [8.8637788, 47.4985835], lines: ['S12', 'S35'] },
  { name: 'Emmat', coordinates: [8.7011717, 47.2924641], lines: ['S18'] },
  { name: 'Embrach-Rorbas', coordinates: [8.5874281, 47.5207004], lines: ['S41'] },
  { name: 'Erlenbach ZH', coordinates: [8.5916311, 47.3058105], lines: ['S6', 'S16'] },
  { name: 'Esslingen', coordinates: [8.7092924, 47.2883269], lines: ['S18'] },
  { name: 'Fehraltorf', coordinates: [8.7499755, 47.385207], lines: ['S3', 'S19'] },
  { name: 'Feldbach', coordinates: [8.7828935, 47.239099], lines: ['S7', 'S16'] },
  { name: 'Fischenthal', coordinates: [8.923283, 47.3331349], lines: ['S26'] },
  { name: 'Forch', coordinates: [8.6477668, 47.3252397], lines: ['S18'] },
  { name: 'Freienbach SBB', coordinates: [8.756151, 47.2073496], lines: ['S8'] },
  { name: 'Freienbach SOB', coordinates: [8.759192, 47.2040568], lines: ['S40'] },
  { name: 'Gibswil', coordinates: [8.9156936, 47.3136523], lines: ['S26'] },
  { name: 'Glanzenberg', coordinates: [8.4203912, 47.3988429], lines: ['S11', 'S12'] },
  { name: 'Glattbrugg', coordinates: [8.5587525, 47.4307792], lines: ['S3', 'S9', 'S15'] },
  { name: 'Glattfelden', coordinates: [8.5240334, 47.5490586], lines: ['S9'] },
  { name: 'Grüenfeld', coordinates: [8.6874291, 47.1983064], lines: ['S13'] },
  { name: 'Hedingen', coordinates: [8.4456737, 47.2989009], lines: ['S5', 'S14'] },
  { name: 'Henggart', coordinates: [8.6849144, 47.5648639], lines: ['S12', 'S33'] },
  { name: 'Herrliberg-Feldmeilen', coordinates: [8.6132752, 47.281681], lines: ['S6', 'S16'] },
  { name: 'Hettlingen', coordinates: [8.6951242, 47.5445712], lines: ['S12', 'S33'] },
  { name: 'Hinteregg', coordinates: [8.683942, 47.3059459], lines: ['S18'] },
  { name: 'Hinwil', coordinates: [8.8397603, 47.3000892], lines: ['S3', 'S14'] },
  { name: 'Horgen', coordinates: [8.5964804, 47.2616808], lines: ['S2', 'S8'] },
  { name: 'Horgen Oberdorf', coordinates: [8.5895952, 47.2587473], lines: ['S24'] },
  { name: 'Hurden', coordinates: [8.8006546, 47.2141934], lines: ['S40'] },
  { name: 'Hüntwangen-Wil', coordinates: [8.5137422, 47.5822144], lines: ['S9'] },
  { name: 'Illnau', coordinates: [8.7226318, 47.4088012], lines: ['S3', 'S19'] },
  { name: 'Kaiserstuhl AG', coordinates: [8.4192, 47.5664], lines: ['S36'] },
  { name: 'Kempten', coordinates: [8.804536, 47.3319539], lines: ['S3'] },
  { name: 'Kemptthal', coordinates: [8.7057857, 47.4530184], lines: ['S7', 'S24'] },
  { name: 'Kilchberg', coordinates: [8.547906, 47.3244417], lines: ['S8', 'S24'] },
  { name: 'Kloten', coordinates: [8.5830911, 47.4481195], lines: ['S7'] },
  { name: 'Kloten Balsberg', coordinates: [8.5708943, 47.4422924], lines: ['S7'] },
  { name: 'Knonau', coordinates: [8.4667192, 47.2205305], lines: ['S5'] },
  { name: 'Kollbrunn', coordinates: [8.7739581, 47.4584242], lines: ['S11', 'S26'] },
  { name: 'Küsnacht Goldbach', coordinates: [8.5757165, 47.3269084], lines: ['S6', 'S16'] },
  { name: 'Küsnacht ZH', coordinates: [8.5808177, 47.3191454], lines: ['S6', 'S16', 'S20'] },
  { name: 'Langwies ZH', coordinates: [8.694048, 47.2962416], lines: ['S18'] },
  { name: 'Langnau-Gattikon', coordinates: [8.5440608, 47.2874247], lines: ['S4'] },
  { name: 'Maiacher', coordinates: [8.6305731, 47.3282598], lines: ['S18'] },
  { name: 'Marthalen', coordinates: [8.6560696, 47.6311069], lines: ['S12', 'S33'] },
  { name: 'Meilen', coordinates: [8.6443636, 47.2698432], lines: ['S6', 'S7', 'S16', 'S20'] },
  { name: 'Mettmenstetten', coordinates: [8.4572421, 47.2441078], lines: ['S5'] },
  { name: 'Männedorf', coordinates: [8.6928142, 47.2533139], lines: ['S7', 'S16', 'S20'] },
  { name: 'Niederglatt ZH', coordinates: [8.5036893, 47.4873108], lines: ['S9'] },
  { name: 'Niederhasli', coordinates: [8.488628, 47.4782556], lines: ['S15'] },
  { name: 'Niederweningen', coordinates: [8.3694459, 47.5111791], lines: ['S15'] },
  { name: 'Niederweningen Dorf', coordinates: [8.3807976, 47.5059271], lines: ['S15'] },
  { name: 'Neue Forch', coordinates: [8.6373733, 47.326007], lines: ['S18'] },
  { name: 'Neuhaus bei Hinteregg', coordinates: [8.6735036, 47.312914], lines: ['S18'] },
  { name: 'Nänikon-Greifensee', coordinates: [8.6856218, 47.3697555], lines: ['S9', 'S14'] },
  { name: 'Oberglatt ZH', coordinates: [8.5100353, 47.4704811], lines: ['S3', 'S9', 'S15'] },
  { name: 'Oberrieden', coordinates: [8.5786981, 47.2795484], lines: ['S8'] },
  { name: 'Oberrieden Dorf', coordinates: [8.5777286, 47.2769043], lines: ['S24'] },
  {
    name: 'Oberwinterthur',
    coordinates: [8.7598693, 47.5070187],
    lines: ['S11', 'S24', 'S29', 'S30'],
  },
  { name: 'Opfikon', coordinates: [8.5618761, 47.4299234], lines: ['S7'] },
  { name: 'Ossingen', coordinates: [8.7241059, 47.6146875], lines: ['S29'] },
  { name: 'Otelfingen', coordinates: [8.3881228, 47.4549787], lines: ['S6'] },
  { name: 'Otelfingen Golfpark', coordinates: [8.4021092, 47.4557824], lines: ['S6'] },
  { name: 'Pfungen', coordinates: [8.6469864, 47.5158733], lines: ['S41'] },
  {
    name: 'Pfäffikon SZ',
    coordinates: [8.7782258, 47.2033385],
    lines: ['S2', 'S5', 'S8', 'S25', 'S40'],
  },
  { name: 'Pfäffikon ZH', coordinates: [8.7849677, 47.3671176], lines: ['S3', 'S19'] },
  { name: 'Rafz', coordinates: [8.5433524, 47.6034542], lines: ['S9'] },
  {
    name: 'Rapperswil SG',
    coordinates: [8.8169129, 47.2245321],
    lines: ['S5', 'S7', 'S15', 'S26', 'S40'],
  },
  { name: 'Regensdorf-Watt', coordinates: [8.4713424, 47.4372129], lines: ['S6', 'S21'] },
  { name: 'Reppischhof', coordinates: [8.3961337, 47.38426], lines: ['S17'] },
  { name: 'Reutlingen', coordinates: [8.752067, 47.5295654], lines: ['S11', 'S29'] },
  { name: 'Richterswil', coordinates: [8.7074352, 47.2086171], lines: ['S2', 'S8'] },
  { name: 'Rickenbach-Attikon', coordinates: [8.7890541, 47.5352373], lines: ['S24', 'S30'] },
  { name: 'Riedmatt SZ', coordinates: [8.7120987, 47.1967329], lines: ['S40'] },
  { name: 'Rikon', coordinates: [8.7964912, 47.444857], lines: ['S11', 'S26'] },
  { name: 'Ringlikon', coordinates: [8.4773667, 47.3602849], lines: ['S10'] },
  { name: 'Rämismühle-Zell', coordinates: [8.8194707, 47.4414619], lines: ['S11', 'S26'] },
  { name: 'Räterschen', coordinates: [8.7951034, 47.4988091], lines: ['S12', 'S35'] },
  { name: 'Rümlang', coordinates: [8.5332376, 47.4540478], lines: ['S9', 'S15'] },
  { name: 'Rüschlikon', coordinates: [8.5551716, 47.3068825], lines: ['S8', 'S24'] },
  { name: 'Rüti ZH', coordinates: [8.8551497, 47.2602731], lines: ['S5', 'S14', 'S15', 'S26'] },
  { name: 'Saland', coordinates: [8.8538438, 47.3946855], lines: ['S26'] },
  { name: 'Samstagern', coordinates: [8.6861331, 47.191408], lines: ['S13', 'S40'] },
  { name: 'Scheuren', coordinates: [8.6592653, 47.3227797], lines: ['S18'] },
  { name: 'Schindellegi-Feusisberg', coordinates: [8.7091442, 47.1764857], lines: ['S13', 'S40'] },
  { name: 'Schlieren', coordinates: [8.4465178, 47.3992511], lines: ['S5', 'S11', 'S12'] },
  {
    name: 'Schloss Laufen am Rheinfall',
    coordinates: [8.6141462, 47.6764909],
    lines: ['S12', 'S33'],
  },
  { name: 'Schottikon', coordinates: [8.8102481, 47.500225], lines: ['S12', 'S35'] },
  { name: 'Schwerzenbach ZH', coordinates: [8.6587429, 47.3842565], lines: ['S9', 'S14'] },
  { name: 'Schöfflisdorf-Oberweningen', coordinates: [8.4119882, 47.4978413], lines: ['S15'] },
  { name: 'Sennhof-Kyburg', coordinates: [8.7604691, 47.4652292], lines: ['S11', 'S26'] },
  { name: 'Seuzach', coordinates: [8.738963, 47.5358162], lines: ['S11', 'S29'] },
  { name: 'Sihlau', coordinates: [8.5251936, 47.3033336], lines: ['S4'] },
  { name: 'Sihlwald', coordinates: [8.5576946, 47.2682937], lines: ['S4'] },
  { name: 'Sood-Oberleimbach', coordinates: [8.5214552, 47.3195732], lines: ['S4'] },
  { name: 'Spital Zollikerberg', coordinates: [8.5966347, 47.3473568], lines: ['S18'] },
  { name: 'Stammheim', coordinates: [8.7884428, 47.6353293], lines: ['S29'] },
  { name: 'Steg', coordinates: [8.9323892, 47.3537031], lines: ['S26'] },
  { name: 'Steinmaur', coordinates: [8.4472656, 47.4900917], lines: ['S15'] },
  { name: 'Stettbach', coordinates: [8.5960455, 47.397188], lines: ['S3', 'S9', 'S11', 'S12'] },
  { name: 'Stäfa', coordinates: [8.7223162, 47.2405471], lines: ['S7', 'S16', 'S20'] },
  { name: 'Tann-Dürnten', coordinates: [8.8526705, 47.2683145], lines: ['S26'] },
  { name: 'Thalheim-Altikon', coordinates: [8.7574066, 47.5691998], lines: ['S29'] },
  { name: 'Thalwil', coordinates: [8.5645619, 47.2959744], lines: ['S2', 'S8', 'S24'] },
  { name: 'Turbenthal', coordinates: [8.8437649, 47.4371675], lines: ['S11', 'S26'] },
  { name: 'Uerikon', coordinates: [8.752469, 47.2356832], lines: ['S7', 'S16', 'S20'] },
  {
    name: 'Uetikon am See',
    coordinates: [8.6794073, 47.2587844],
    lines: ['S6', 'S7', 'S16', 'S20'],
    apiNames: ['Uetikon'],
  },
  { name: 'Uetliberg', coordinates: [8.4874187, 47.3518692], lines: ['S10'] },
  { name: 'Uitikon Waldegg', coordinates: [8.4657676, 47.3661005], lines: ['S10'] },
  { name: 'Urdorf', coordinates: [8.4347349, 47.3909741], lines: ['S5', 'S14'] },
  { name: 'Urdorf Weihermatt', coordinates: [8.4302617, 47.3810155], lines: ['S5', 'S14'] },
  { name: 'Uster', coordinates: [8.7177164, 47.351069], lines: ['S5', 'S9', 'S14', 'S15'] },
  { name: 'Wald ZH', coordinates: [8.9139616, 47.2727268], lines: ['S26'] },
  { name: 'Wallisellen', coordinates: [8.5921031, 47.4124508], lines: ['S8', 'S14', 'S19'] },
  { name: 'Wetzikon ZH', coordinates: [8.7922223, 47.3179073], lines: ['S3', 'S5', 'S14', 'S15'] },
  { name: 'Wiesendangen', coordinates: [8.7758742, 47.525294], lines: ['S24', 'S30'] },
  { name: 'Wila', coordinates: [8.8487032, 47.4178283], lines: ['S11', 'S26'] },
  { name: 'Wildpark-Höfli', coordinates: [8.5356095, 47.2965022], lines: ['S4'] },
  { name: 'Wilen bei Wollerau', coordinates: [8.7343815, 47.1976358], lines: ['S40'] },
  { name: 'Winkel am Zürichsee', coordinates: [8.598873, 47.2973696], lines: ['S6', 'S16'] },
  {
    name: 'Winterthur',
    coordinates: [8.7236475, 47.5003973],
    lines: ['S7', 'S8', 'S11', 'S12', 'S24', 'S26', 'S29', 'S30', 'S33', 'S35', 'S41'],
  },
  {
    name: 'Winterthur Grüze',
    coordinates: [8.7507812, 47.4989422],
    lines: ['S11', 'S12', 'S26', 'S35'],
  },
  { name: 'Winterthur Hegi', coordinates: [8.7691133, 47.5015567], lines: ['S12', 'S35'] },
  { name: 'Winterthur Seen', coordinates: [8.7669424, 47.4874304], lines: ['S11', 'S26'] },
  { name: 'Winterthur Töss', coordinates: [8.7101861, 47.4897138], lines: ['S41'] },
  { name: 'Winterthur Wallrüti', coordinates: [8.7608432, 47.5172475], lines: ['S11', 'S29'] },
  { name: 'Winterthur Wülflingen', coordinates: [8.6806649, 47.5064678], lines: ['S41'] },
  { name: 'Wollerau', coordinates: [8.724957, 47.1955052], lines: ['S40'] },
  { name: 'Waltikon', coordinates: [8.6159485, 47.3370939], lines: ['S18'] },
  { name: 'Wädenswil', coordinates: [8.6752624, 47.2294934], lines: ['S2', 'S8', 'S13', 'S25'] },
  { name: 'Zollikerberg', coordinates: [8.6031026, 47.3461943], lines: ['S18'] },
  { name: 'Zollikon', coordinates: [8.5693835, 47.3374235], lines: ['S6', 'S16'] },
  { name: 'Zumikon', coordinates: [8.623614, 47.3320659], lines: ['S18'] },
  { name: 'Zweidlen', coordinates: [8.4678285, 47.5705548], lines: ['S36'] },
  { name: 'Zürich Affoltern', coordinates: [8.5083734, 47.4210019], lines: ['S6', 'S21'] },
  {
    name: 'Zürich Altstetten',
    coordinates: [8.4891603, 47.3916877],
    lines: ['S5', 'S11', 'S12', 'S14', 'S19', 'S42'],
  },
  { name: 'Zürich Balgrist', coordinates: [8.5749494, 47.354721], lines: ['S18'] },
  { name: 'Zürich Binz', coordinates: [8.5180666, 47.3628112], lines: ['S10'] },
  { name: 'Zürich Brunau', coordinates: [8.5262371, 47.3515002], lines: ['S4'] },
  { name: 'Zürich Enge', coordinates: [8.5307405, 47.3639818], lines: ['S2', 'S8', 'S24'] },
  { name: 'Zürich Flughafen', coordinates: [8.5618983, 47.4501308], lines: ['S2', 'S16', 'S24'] },
  { name: 'Zürich Friesenberg', coordinates: [8.5075442, 47.3648313], lines: ['S10'] },
  { name: 'Zürich Giesshübel', coordinates: [8.5218766, 47.3625688], lines: ['S4'] },
  { name: 'Zürich Hegibachplatz', coordinates: [8.5604596, 47.3618834], lines: ['S18'] },
  {
    name: 'Zürich Hardbrücke',
    coordinates: [8.5174153, 47.3851003],
    lines: ['S3', 'S5', 'S6', 'S7', 'S9', 'S11', 'S12', 'S15', 'S16', 'S21'],
  },
  {
    name: 'Zürich Hauptbahnhof',
    coordinates: [8.5390316, 47.3779298],
    lines: [
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
      'S11',
      'S12',
      'S14',
      'S15',
      'S16',
      'S19',
      'S20',
      'S21',
      'S24',
      'S25',
      'S42',
    ],
    apiNames: ['Zürich HB'],
  },
  { name: 'Zürich Kreuzplatz', coordinates: [8.5533988, 47.3651691], lines: ['S18'] },
  { name: 'Zürich Leimbach', coordinates: [8.5187128, 47.3330367], lines: ['S4'] },
  { name: 'Zürich Manegg', coordinates: [8.5196862, 47.3378168], lines: ['S4'] },
  {
    name: 'Zürich Oerlikon',
    coordinates: [8.5444351, 47.4118837],
    lines: ['S2', 'S3', 'S6', 'S7', 'S8', 'S9', 'S14', 'S15', 'S16', 'S19', 'S21', 'S24'],
  },
  { name: 'Zürich Rehalp', coordinates: [8.5832768, 47.3510817], lines: ['S18'] },
  { name: 'Zürich Saalsporthalle', coordinates: [8.5218635, 47.3580384], lines: ['S4'] },
  { name: 'Zürich Schweighof', coordinates: [8.5034113, 47.3649771], lines: ['S10'] },
  { name: 'Zürich Seebach', coordinates: [8.5439337, 47.4186085], lines: ['S6'] },
  { name: 'Zürich Selnau', coordinates: [8.5317945, 47.3724833], lines: ['S4', 'S10'] },
  {
    name: 'Zürich Stadelhofen',
    coordinates: [8.5487034, 47.3666856],
    lines: ['S3', 'S5', 'S6', 'S7', 'S9', 'S11', 'S12', 'S15', 'S16', 'S18', 'S20'],
  },
  {
    name: 'Zürich Tiefenbrunnen',
    coordinates: [8.5616716, 47.3503013],
    lines: ['S6', 'S7', 'S16'],
  },
  { name: 'Zürich Triemli', coordinates: [8.4953705, 47.3649344], lines: ['S10'] },
  { name: 'Zürich Wiedikon', coordinates: [8.5221578, 47.3724433], lines: ['S2', 'S8', 'S24'] },
  { name: 'Zürich Wipkingen', coordinates: [8.52903, 47.3920394], lines: ['S24'] },
  { name: 'Zürich Wollishofen', coordinates: [8.5338801, 47.3479186], lines: ['S8', 'S24'] },
]

/** Derive line names from station data */
export const lineNames: string[] = (() => {
  const set = new Set<string>()
  for (const s of stations) {
    for (const l of s.lines) set.add(l)
  }
  return [...set].sort((a, b) => {
    const na = parseInt(a.slice(1))
    const nb = parseInt(b.slice(1))
    return na - nb
  })
})()

/** Build geo line drawings by collecting stations per line and sorting by shortest open path */
export function buildGeoLines(): Record<string, [number, number][]> {
  const lineStations = new Map<string, { name: string; coords: [number, number] }[]>()
  for (const s of stations) {
    for (const line of s.lines) {
      const arr = lineStations.get(line)
      const entry = { name: s.name, coords: s.coordinates }
      if (arr) arr.push(entry)
      else lineStations.set(line, [entry])
    }
  }

  const result: Record<string, [number, number][]> = {}
  for (const [line, stns] of lineStations) {
    if (stns.length < 2) continue
    result[line] = shortestNNPath(stns.map((s) => s.coords))
  }
  return result
}

/**
 * Find the shortest open path through points using nearest-neighbor from every
 * starting point and keeping the shortest result. O(n³) but n ≤ ~20 for S-Bahn lines.
 */
function shortestNNPath(points: [number, number][]): [number, number][] {
  let bestPath: [number, number][] = []
  let bestDist = Infinity

  for (let start = 0; start < points.length; start++) {
    const remaining = [...points]
    const path: [number, number][] = []
    let current = remaining.splice(start, 1)[0]
    path.push(current)
    let totalDist = 0

    while (remaining.length > 0) {
      let nearestIdx = 0
      let nearestDist = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const d = squaredDist(current, remaining[i])
        if (d < nearestDist) {
          nearestDist = d
          nearestIdx = i
        }
      }
      totalDist += nearestDist
      current = remaining.splice(nearestIdx, 1)[0]
      path.push(current)
    }

    if (totalDist < bestDist) {
      bestDist = totalDist
      bestPath = path
    }
  }

  return bestPath
}

function squaredDist(a: [number, number], b: [number, number]): number {
  const cosLat = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  const dx = (a[0] - b[0]) * cosLat
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}
