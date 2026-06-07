// VibeSDR Custom Waterfall/Spectrum v1.5
// GPU-accelerated WebGL waterfall with Canvas2D overlay
// Colour palettes from SDR++ source (SDRPlusPlusBrown)

// ── Packed 256-stop colormaps (6-char hex, no #) ──────────────────────────
const P256: Record<string, string> = {
  gqrx:    '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000500000800000b00000e00001000001300001600001900001c00001e00002100002400002700002a00002c00002f00003200003500003800003a00003d00004000004300004600004800004b00004e00005100005400005600005900005c00005f00006200006400006700006a00006d00007000007200007500007800007b00007e00008000008300008600008900008c02048f040893060c9708109b0a149f0c19a30e1da61021aa1225ae1429b2162db61832ba1a36bd1c3ac11e3ec52042c92246cd244bd1264fd42853d82a57dc2c5be02e5fe43064e83268eb346cef3670f33874f73a78fb3c7dff3f7ffa4382f54784f04b87eb4f8ae6538ce1578fdc5b91d75f94d26397cc6699c76a9cc26e9ebd72a1b876a4b37aa6ae7ea9a982aba486ae9f8ab1998db39491b68f95b88a99bb859dbe80a1c07ba5c376a9c571adc86cb1cb66b4cd61b8d05cbcd257c0d552c4d84dc8da48ccdd43d0df3ed4e239d8e533dbe72edfea29e3ec24e7ef1febf21aeff415f3f710f7f90bfbfc06ffff00fffd00fffa00fff800fff500fff300fff000ffee00ffeb00ffe900ffe600ffe300ffe100ffde00ffdc00ffd900ffd700ffd400ffd200ffcf00ffcc00ffca00ffc700ffc500ffc200ffc000ffbd00ffbb00ffb800ffb600ffb300ffb000ffae00ffab00ffa900ffa600ffa400ffa100ff9f00ff9c00ff9900ff9700ff9400ff9200ff8f00ff8d00ff8a00ff8800ff8500ff8300ff8000ff7d00ff7b00ff7800ff7600ff7300ff7100ff6e00ff6c00ff6900ff6600ff6400ff6100ff5f00ff5c00ff5a00ff5700ff5500ff5200ff5000ff4d00ff4a00ff4800ff4500ff4300ff4000ff3e00ff3b00ff3900ff3600ff3300ff3100ff2e00ff2c00ff2900ff2700ff2400ff2200ff1f00ff1d00ff1a00ff1700ff1500ff1200ff1000ff0d00ff0b00ff0800ff0600ff0300ff0000ff3333ff6666ff9999ffccccffffff',
  inferno: '00000401000501010601010802010A02020C02020E03021004031204031405041706041907051B08051D09061F0A07220B07240C08260D08290E092B10092D110A30120A32140B34150B37160B39180C3C190C3E1B0C411C0C431E0C451F0C48210C4A230C4C240C4F260C51280B53290B552B0B572D0B592F0A5B310A5C320A5E340A5F3609613809623909633B09643D09653E0966400A67420A68440A68450A69470B6A490B6A4A0C6B4C0C6B4D0D6C4F0D6C510E6C520E6D540F6D550F6D57106E59106E5A116E5C126E5D126E5F136E61136E62146E64156E65156E67166E69166E6A176E6C186E6D186E6F196E71196E721A6E741A6E751B6E771C6D781C6D7A1D6D7C1D6D7D1E6D7F1E6C801F6C82206C84206B85216B87216B88226A8A226A8C23698D23698F24699025689225689326679526679727669827669A28659B29649D29649F2A63A02A63A22B62A32C61A52C60A62D60A82E5FA92E5EAB2F5EAD305DAE305CB0315BB1325AB3325AB43359B63458B73557B93556BA3655BC3754BD3853BF3952C03A51C13A50C33B4FC43C4EC63D4DC73E4CC83F4BCA404ACB4149CC4248CE4347CF4446D04545D24644D34743D44842D54A41D74B3FD84C3ED94D3DDA4E3CDB503BDD513ADE5238DF5337E05536E15635E25734E35933E45A31E55C30E65D2FE75E2EE8602DE9612BEA632AEB6429EB6628EC6726ED6925EE6A24EF6C23EF6E21F06F20F1711FF1731DF2741CF3761BF37819F47918F57B17F57D15F67E14F68013F78212F78410F8850FF8870EF8890CF98B0BF98C0AF98E09FA9008FA9207FA9407FB9606FB9706FB9906FB9B06FB9D07FC9F07FCA108FCA309FCA50AFCA60CFCA80DFCAA0FFCAC11FCAE12FCB014FCB216FCB418FBB61AFBB81DFBBA1FFBBC21FBBE23FAC026FAC228FAC42AFAC62DF9C72FF9C932F9CB35F8CD37F8CF3AF7D13DF7D340F6D543F6D746F5D949F5DB4CF4DD4FF4DF53F4E156F3E35AF3E55DF2E661F2E865F2EA69F1EC6DF1ED71F1EF75F1F179F2F27DF2F482F3F586F3F68AF4F88EF5F992F6FA96F8FB9AF9FC9DFAFDA1FCFFA4',
  turbo:   '30123B32154333184A341B51351E5836215F37246638276D392A733A2D793B2F803C32863D358B3E38913F3B973F3E9C4040A24143A74146AC4249B1424BB5434EBA4451BF4454C34456C74559CB455CCF455ED34661D64664DA4666DD4669E0466BE3476EE64771E94773EB4776EE4778F0477BF2467DF44680F64682F84685FA4687FB458AFC458CFD448FFE4391FE4294FF4196FF4099FF3E9BFE3D9EFE3BA0FD3AA3FC38A5FB37A8FA35ABF833ADF731AFF52FB2F42EB4F22CB7F02AB9EE28BCEB27BEE925C0E723C3E422C5E220C7DF1FC9DD1ECBDA1CCDD81BD0D51AD2D21AD4D019D5CD18D7CA18D9C818DBC518DDC218DEC018E0BD19E2BB19E3B91AE4B61CE6B41DE7B21FE9AF20EAAC22EBAA25ECA727EEA42AEFA12CF09E2FF19B32F29835F39438F4913CF58E3FF68A43F78746F8844AF8804EF97D52FA7A55FA7659FB735DFC6F61FC6C65FD6969FD666DFE6271FE5F75FE5C79FE597DFF5680FF5384FF5188FF4E8BFF4B8FFF4992FF4796FE4499FE429CFE409FFD3FA1FD3DA4FC3CA7FC3AA9FB39ACFB38AFFA37B1F936B4F836B7F735B9F635BCF534BEF434C1F334C3F134C6F034C8EF34CBED34CDEC34D0EA34D2E935D4E735D7E535D9E436DBE236DDE037DFDF37E1DD37E3DB38E5D938E7D739E9D539EBD339ECD13AEECF3AEFCD3AF1CB3AF2C93AF4C73AF5C53AF6C33AF7C13AF8BE39F9BC39FABA39FBB838FBB637FCB336FCB136FDAE35FDAC34FEA933FEA732FEA431FEA130FE9E2FFE9B2DFE992CFE962BFE932AFE9029FD8D27FD8A26FC8725FC8423FB8122FB7E21FA7B1FF9781EF9751DF8721CF76F1AF66C19F56918F46617F36315F26014F15D13F05B12EF5811ED5510EC530FEB500EEA4E0DE84B0CE7490CE5470BE4450AE2430AE14109DF3F08DD3D08DC3B07DA3907D83706D63506D43305D23105D02F05CE2D04CC2B04CA2A04C82803C52603C32503C12302BE2102BC2002B91E02B71D02B41B01B21A01AF1801AC1701A91601A71401A41301A112019E10019B0F01980E01950D01920B018E0A018B09028808028507028106027E05027A0403',
  plasma:  '0D088710078813078916078A19068C1B068D1D068E20068F2206902406912605912805922A05932C05942E05952F059631059733059735049837049938049A3A049A3C049B3E049C3F049C41049D43039E44039E46039F48039F4903A04B03A14C02A14E02A25002A25102A35302A35502A45601A45801A45901A55B01A55C01A65E01A66001A66100A76300A76400A76600A76700A86900A86A00A86C00A86E00A86F00A87100A87201A87401A87501A87701A87801A87A02A87B02A87D03A87E03A88004A88104A78305A78405A78606A68707A68808A68A09A58B0AA58D0BA58E0CA48F0DA4910EA3920FA39410A29511A19613A19814A099159F9A169F9C179E9D189D9E199DA01A9CA11B9BA21D9AA31E9AA51F99A62098A72197A82296AA2395AB2494AC2694AD2793AE2892B02991B12A90B22B8FB32C8EB42E8DB52F8CB6308BB7318AB83289BA3388BB3488BC3587BD3786BE3885BF3984C03A83C13B82C23C81C33D80C43E7FC5407EC6417DC7427CC8437BC9447ACA457ACB4679CC4778CC4977CD4A76CE4B75CF4C74D04D73D14E72D24F71D35171D45270D5536FD5546ED6556DD7566CD8576BD9586ADA5A6ADA5B69DB5C68DC5D67DD5E66DE5F65DE6164DF6263E06363E16462E26561E26660E3685FE4695EE56A5DE56B5DE66C5CE76E5BE76F5AE87059E97158E97257EA7457EB7556EB7655EC7754ED7953ED7A52EE7B51EF7C51EF7E50F07F4FF0804EF1814DF1834CF2844BF3854BF3874AF48849F48948F58B47F58C46F68D45F68F44F79044F79143F79342F89441F89540F9973FF9983EF99A3EFA9B3DFA9C3CFA9E3BFB9F3AFBA139FBA238FCA338FCA537FCA636FCA835FCA934FDAB33FDAC33FDAE32FDAF31FDB130FDB22FFDB42FFDB52EFEB72DFEB82CFEBA2CFEBB2BFEBD2AFEBE2AFEC029FDC229FDC328FDC527FDC627FDC827FDCA26FDCB26FCCD25FCCE25FCD025FCD225FBD324FBD524FBD724FAD824FADA24F9DC24F9DD25F8DF25F8E125F7E225F7E425F6E626F6E826F5E926F5EB27F4ED27F3EE27F3F027F2F227F1F426F1F525F0F724F0F921',
  viridis: '44015444025645045745055946075A46085C460A5D460B5E470D60470E6147106347116447136548146748166848176948186A481A6C481B6D481C6E481D6F481F70482071482173482374482475482576482677482878482979472A7A472C7A472D7B472E7C472F7D46307E46327E46337F463480453581453781453882443983443A83443B84433D84433E85423F854240864241864142874144874045884046883F47883F48893E49893E4A893E4C8A3D4D8A3D4E8A3C4F8A3C508B3B518B3B528B3A538B3A548C39558C39568C38588C38598C375A8C375B8D365C8D365D8D355E8D355F8D34608D34618D33628D33638D32648E32658E31668E31678E31688E30698E306A8E2F6B8E2F6C8E2E6D8E2E6E8E2E6F8E2D708E2D718E2C718E2C728E2C738E2B748E2B758E2A768E2A778E2A788E29798E297A8E297B8E287C8E287D8E277E8E277F8E27808E26818E26828E26828E25838E25848E25858E24868E24878E23888E23898E238A8D228B8D228C8D228D8D218E8D218F8D21908D21918C20928C20928C20938C1F948C1F958B1F968B1F978B1F988B1F998A1F9A8A1E9B8A1E9C891E9D891F9E891F9F881FA0881FA1881FA1871FA28720A38620A48621A58521A68522A78522A88423A98324AA8325AB8225AC8226AD8127AD8128AE8029AF7F2AB07F2CB17E2DB27D2EB37C2FB47C31B57B32B67A34B67935B77937B87838B9773ABA763BBB753DBC743FBC7340BD7242BE7144BF7046C06F48C16E4AC16D4CC26C4EC36B50C46A52C56954C56856C66758C7655AC8645CC8635EC96260CA6063CB5F65CB5E67CC5C69CD5B6CCD5A6ECE5870CF5773D05675D05477D1537AD1517CD2507FD34E81D34D84D44B86D54989D5488BD6468ED64590D74393D74195D84098D83E9BD93C9DD93BA0DA39A2DA37A5DB36A8DB34AADC32ADDC30B0DD2FB2DD2DB5DE2BB8DE29BADE28BDDF26C0DF25C2DF23C5E021C8E020CAE11FCDE11DD0E11CD2E21BD5E21AD8E219DAE319DDE318DFE318E2E418E5E419E7E419EAE51AECE51BEFE51CF1E51DF4E61EF6E620F8E621FBE723FDE725',
  magma:   '00000401000501010601010802010902020B02020D03030F03031204041405041606051806051A07061C08071E0907200A08220B09240C09260D0A290E0B2B100B2D110C2F120D31130D34140E36150E38160F3B180F3D19103F1A10421C10441D11471E114920114B21114E22115024125325125527125829115A2A115C2C115F2D11612F116331116533106734106936106B38106C390F6E3B0F703D0F713F0F72400F74420F75440F764510774710784910784A10794C117A4E117B4F127B51127C52137C54137D56147D57157E59157E5A167E5C167F5D177F5F187F601880621980641A80651A80671B80681C816A1C816B1D816D1D816E1E81701F81721F817320817521817621817822817922827B23827C23827E24828025828125818326818426818627818827818928818B29818C29818E2A81902A81912B81932B80942C80962C80982D80992D809B2E7F9C2E7F9E2F7FA02F7FA1307EA3307EA5317EA6317DA8327DAA337DAB337CAD347CAE347BB0357BB2357BB3367AB5367AB73779B83779BA3878BC3978BD3977BF3A77C03A76C23B75C43C75C53C74C73D73C83E73CA3E72CC3F71CD4071CF4070D0416FD2426FD3436ED5446DD6456CD8456CD9466BDB476ADC4869DE4968DF4A68E04C67E24D66E34E65E44F64E55064E75263E85362E95462EA5661EB5760EC5860ED5A5FEE5B5EEF5D5EF05F5EF1605DF2625DF2645CF3655CF4675CF4695CF56B5CF66C5CF66E5CF7705CF7725CF8745CF8765CF9785DF9795DF97B5DFA7D5EFA7F5EFA815FFB835FFB8560FB8761FC8961FC8A62FC8C63FC8E64FC9065FD9266FD9467FD9668FD9869FD9A6AFD9B6BFE9D6CFE9F6DFEA16EFEA36FFEA571FEA772FEA973FEAA74FEAC76FEAE77FEB078FEB27AFEB47BFEB67CFEB77EFEB97FFEBB81FEBD82FEBF84FEC185FEC287FEC488FEC68AFEC88CFECA8DFECC8FFECD90FECF92FED194FED395FED597FED799FED89AFDDA9CFDDC9EFDDEA0FDE0A1FDE2A3FDE3A5FDE5A7FDE7A9FDE9AAFDEBACFCECAEFCEEB0FCF0B2FCF2B4FCF4B6FCF6B8FCF7B9FCF9BBFCFBBDFCFDBF',
};

// ── Short-stop colormaps ────────────────────────────────────────────────────
const P_STOPS: Record<string, string[]> = {
  'Classic':       ['#000020','#000030','#000050','#000091','#1E90FF','#FFFFFF','#FFFF00','#FE6D16','#FE6D16','#FF0000','#FF0000','#C60000','#9F0000','#750000','#4A0000'],
  'Classic Green': ['#000000','#000030','#002851','#004993','#009BE6','#80FF80','#80FF80','#FFA042','#FF0000','#C60000','#9F0000','#750000','#4A0000'],
  'Electric':      ['#000000','#0000FF','#00FFFF','#FFFFFF'],
  'Greyscale':     ['#000000','#FFFFFF'],
  'Smoke':         ['#000000','#111111','#333333','#555555','#777777','#CCCCCC','#EEEEEE','#FFFFFF'],
  'WebSDR':        ['#000000','#000050','#FF00FF','#FFFF50','#FFFFFF'],
  'Vivid':         ['#000000','#06001c','#090028','#12002c','#230039','#360143','#440154','#472c7a','#3b518b','#2c718e','#21908d','#27ad81','#5cc863','#aadc32','#f6fd25','#fdde17','#fecb31','#FE9029','#F56918','#DC3B07','#CE2D04','#AC1701','#980E01'],
  'Temper':        ['#000000','#05011f','#0f0836','#2f1436','#3d114d','#4e186f','#592a8f','#5e43a5','#5f5eb3','#6276ba','#6b8cbf','#7ba1c2','#95b5c7','#b3c6ce','#d4bcac','#cca389','#c68a6d','#be6f5b','#b25652','#a24050','#8e2c50','#741e4f'],
  'Jet':           ['#00008f','#0000ff','#00ffff','#ffff00','#ff0000','#800000'],
  'Sonar':         ['#000000','#000800','#001a00','#003300','#005000','#007800','#00aa00','#00cc00','#00ff00','#80ff80','#ccffcc','#efffff'],
};

// ── Bandplan ────────────────────────────────────────────────────────────────
// [minHz, maxHz, type, label]
// type: 0=Amateur 1=Broadcast 2=Utility 3=CB 4=Aviation 5=Maritime

type Band = [number, number, number, string];

// Shared infrastructure bands (identical across all ITU regions)
const _BANDS_INFRA: Band[] = [
  // Utility
  [9000,      30000,     2, 'VLF'],
  [283000,    525000,    2, 'NDB'],
  [162400000, 162550000, 2, 'NOAA WX'],
  // CB
  [26965000,  27405000,  3, 'CB'],
  [27601250,  27991250,  3, 'CB FM'],
  // Aviation
  [108000000, 118000000, 4, 'VOR/ILS'],
  [118000000, 136000000, 4, 'VHF Air'],
  [2850000,   3155000,   4, 'HF Aero'],
  [3400000,   3500000,   4, 'HF Aero'],
  [5450000,   5730000,   4, 'HF Aero'],
  [6525000,   6765000,   4, 'HF Aero'],
  [8815000,   9040000,   4, 'HF Aero'],
  [11175000,  11400000,  4, 'HF Aero'],
  [13200000,  13360000,  4, 'HF Aero'],
  [17900000,  18030000,  4, 'HF Aero'],
  [21924000,  22000000,  4, 'HF Aero'],
  // Maritime
  [4000000,   4438000,   5, 'HF Marine'],
  [6200000,   6525000,   5, 'HF Marine'],
  [8195000,   8815000,   5, 'HF Marine'],
  [12230000,  13200000,  5, 'HF Marine'],
  [16360000,  17480000,  5, 'HF Marine'],
  [156000000, 174000000, 5, 'VHF Marine'],
];

// ITU Region 1: Europe, Africa, Middle East, Russia west of Urals
const BANDS_R1: Band[] = [
  // Amateur
  [135700,    137800,    0, '2200m'],
  [472000,    479000,    0, '630m'],
  [1800000,   2000000,   0, '160m'],
  [3500000,   3800000,   0, '80m'],   // R1: 80m only (no 75m phone)
  [5351500,   5366500,   0, '60m'],
  [7000000,   7200000,   0, '40m'],   // R1: 7.0-7.2 MHz
  [10100000,  10150000,  0, '30m'],
  [14000000,  14350000,  0, '20m'],
  [18068000,  18168000,  0, '17m'],
  [21000000,  21450000,  0, '15m'],
  [24890000,  24990000,  0, '12m'],
  [28000000,  29700000,  0, '10m'],
  [50000000,  52000000,  0, '6m'],
  [70000000,  70500000,  0, '4m'],    // R1 only
  [144000000, 146000000, 0, '2m'],
  [430000000, 440000000, 0, '70cm'],
  // Broadcast
  [148500,    283500,    1, 'LW'],
  [526500,    1606500,   1, 'MW'],
  [3900000,   4000000,   1, '75m'],
  [5900000,   6200000,   1, '49m'],
  [7200000,   7450000,   1, '41m'],   // R1: 41m SW broadcast
  [9400000,   9900000,   1, '31m'],
  [11600000,  12100000,  1, '25m'],
  [13570000,  13870000,  1, '22m'],
  [15100000,  15800000,  1, '19m'],
  [17480000,  17900000,  1, '16m'],
  [21450000,  21850000,  1, '13m'],
  [25670000,  26100000,  1, '11m'],
  [87500000,  108000000, 1, 'FM'],
  ..._BANDS_INFRA,
];

// ITU Region 2: Americas
const BANDS_R2: Band[] = [
  // Amateur
  [135700,    137800,    0, '2200m'],
  [472000,    479000,    0, '630m'],
  [1800000,   2000000,   0, '160m'],
  [3500000,   4000000,   0, '80/75m'], // R2: includes 75m phone segment
  [5330500,   5403500,   0, '60m'],
  [7000000,   7300000,   0, '40m'],    // R2: 7.0-7.3 MHz
  [10100000,  10150000,  0, '30m'],
  [14000000,  14350000,  0, '20m'],
  [18068000,  18168000,  0, '17m'],
  [21000000,  21450000,  0, '15m'],
  [24890000,  24990000,  0, '12m'],
  [28000000,  29700000,  0, '10m'],
  [50000000,  54000000,  0, '6m'],
  [144000000, 148000000, 0, '2m'],
  [420000000, 450000000, 0, '70cm'],
  // Broadcast (no LW; MW extends to 1705 kHz; no 41m - that's amateur)
  [535000,    1705000,   1, 'MW'],
  [5900000,   6200000,   1, '49m'],
  [9400000,   9900000,   1, '31m'],
  [11600000,  12100000,  1, '25m'],
  [13570000,  13870000,  1, '22m'],
  [15100000,  15800000,  1, '19m'],
  [17480000,  17900000,  1, '16m'],
  [21450000,  21850000,  1, '13m'],
  [25670000,  26100000,  1, '11m'],
  [87900000,  107900000, 1, 'FM'],
  ..._BANDS_INFRA,
];

// ITU Region 3: Asia, Australasia, Pacific
const BANDS_R3: Band[] = [
  // Amateur
  [135700,    137800,    0, '2200m'],
  [472000,    479000,    0, '630m'],
  [1800000,   2000000,   0, '160m'],
  [3500000,   3900000,   0, '80m'],   // R3: 3.5-3.9 MHz
  [5351500,   5366500,   0, '60m'],
  [7000000,   7200000,   0, '40m'],   // R3: 7.0-7.2 MHz
  [10100000,  10150000,  0, '30m'],
  [14000000,  14350000,  0, '20m'],
  [18068000,  18168000,  0, '17m'],
  [21000000,  21450000,  0, '15m'],
  [24890000,  24990000,  0, '12m'],
  [28000000,  29700000,  0, '10m'],
  [50000000,  54000000,  0, '6m'],
  [144000000, 148000000, 0, '2m'],
  [430000000, 440000000, 0, '70cm'],
  // Broadcast
  [526500,    1606500,   1, 'MW'],
  [3900000,   4000000,   1, '75m'],
  [5900000,   6200000,   1, '49m'],
  [7200000,   7450000,   1, '41m'],   // R3: 41m SW broadcast
  [9400000,   9900000,   1, '31m'],
  [11600000,  12100000,  1, '25m'],
  [13570000,  13870000,  1, '22m'],
  [15100000,  15800000,  1, '19m'],
  [17480000,  17900000,  1, '16m'],
  [21450000,  21850000,  1, '13m'],
  [25670000,  26100000,  1, '11m'],
  [87500000,  108000000, 1, 'FM'],
  ..._BANDS_INFRA,
];

// Worldwide fallback: superset of all regions
const BANDS_WORLD: Band[] = [
  // Amateur (broadest allocations)
  [135700,    137800,    0, '2200m'],
  [472000,    479000,    0, '630m'],
  [1800000,   2000000,   0, '160m'],
  [3500000,   4000000,   0, '80/75m'],
  [5330500,   5403500,   0, '60m'],
  [7000000,   7300000,   0, '40m'],
  [10100000,  10150000,  0, '30m'],
  [14000000,  14350000,  0, '20m'],
  [18068000,  18168000,  0, '17m'],
  [21000000,  21450000,  0, '15m'],
  [24890000,  24990000,  0, '12m'],
  [28000000,  29700000,  0, '10m'],
  [50000000,  54000000,  0, '6m'],
  [70000000,  70500000,  0, '4m'],
  [144000000, 148000000, 0, '2m'],
  [430000000, 450000000, 0, '70cm'],
  // Broadcast (superset)
  [148500,    283500,    1, 'LW'],
  [526500,    1705000,   1, 'MW'],
  [3900000,   4000000,   1, '75m'],
  [5900000,   6200000,   1, '49m'],
  [7200000,   7450000,   1, '41m'],
  [9400000,   9900000,   1, '31m'],
  [11600000,  12100000,  1, '25m'],
  [13570000,  13870000,  1, '22m'],
  [15100000,  15800000,  1, '19m'],
  [17480000,  17900000,  1, '16m'],
  [21450000,  21850000,  1, '13m'],
  [25670000,  26100000,  1, '11m'],
  [87500000,  108000000, 1, 'FM'],
  ..._BANDS_INFRA,
];

// ── Build JSON for embedding ─────────────────────────────────────────────
const _cmapData = JSON.stringify({ p256: P256, stops: P_STOPS });
const _bandData = JSON.stringify({ r1: BANDS_R1, r2: BANDS_R2, r3: BANDS_R3, world: BANDS_WORLD });

// ── HTML template (CSS + canvas elements only — NO script tag) ───────────
// The waterfall JS is exported separately as VIBE_WATERFALL_JS and embedded
// directly in injectJavaScript so it runs outside any CSP restrictions.
export const VIBE_WATERFALL_HTML: string = `
<style id="vsdr-css">
body{background:#000!important;}
#vsdr-root{
  position:fixed;inset:0;z-index:9000;pointer-events:none;overflow:hidden;
  background:transparent;
}
#vsdr-wf,#vsdr-ov{
  position:absolute;inset:0;width:100%;height:100%;display:block;
}
#vsdr-wf{ background:#000; }
/* Hide ALL native SDR canvases — we own rendering and touch handling entirely */
canvas:not(#vsdr-wf):not(#vsdr-ov):not(#lsv-vfo):not(#lsv-zoom):not(#lsv-dec-canvas):not(#lsv-snr-spark):not(#lsv-snr-spark-lscape){
  opacity:0!important;pointer-events:none!important;
}
/* vsdr-ov sits on top and receives all touch input */
#vsdr-ov{ pointer-events:auto; }
/* Hide UberSDR's spectrum/waterfall controls — replaced by VibeSDR panel */
#lsv-mp-spectrum-row,
#lsv-mp-spectrum-toggle,
#lsv-mp-hold,
#lsv-mp-hold-row,
#lsv-mp-smooth,
#lsv-mp-smooth-row,
.lsv-mp-slider-wrap,
#lsv-mp-palette-row{
  display:none!important;
}
/* Spectrum settings — floating bottom pill */
#vsdr-sp-panel{
  position:fixed;bottom:0;left:0;right:0;z-index:9999;
  background:rgba(10,8,4,0.97);
  border-top:2px solid rgba(255,184,51,0.45);
  border-radius:14px 14px 0 0;
  display:none;flex-direction:column;
  color:#FFB833;font:13px "Courier New",monospace;
  pointer-events:auto;
  max-height:60vh;overflow-y:auto;
  padding-bottom:env(safe-area-inset-bottom,0px);
}
#vsdr-sp-panel .vsdr-sp-head{
  display:flex;justify-content:space-between;align-items:center;
  padding:10px 14px 8px;border-bottom:1px solid rgba(255,184,51,0.2);
  font-size:13px;font-weight:bold;letter-spacing:1px;
  position:sticky;top:0;background:rgba(10,8,4,0.98);z-index:1;
}
#vsdr-sp-panel .vsdr-sp-close{
  font-size:18px;cursor:pointer;line-height:1;padding:3px 10px;
  border:1px solid #FFB833;border-radius:5px;
  background:rgba(255,184,51,0.08);
}
#vsdr-sp-panel .vsdr-sp-section{
  font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;
  color:rgba(255,184,51,0.55);border-bottom:1px solid rgba(255,184,51,0.12);
  padding-bottom:4px;margin-top:2px;
}
#vsdr-sp-panel .vsdr-sp-body{
  padding:10px 14px 14px;display:flex;flex-direction:column;gap:10px;
}
#vsdr-sp-panel .vsdr-sp-row{
  display:flex;align-items:center;gap:8px;
}
#vsdr-sp-panel .vsdr-sp-label{
  width:68px;flex-shrink:0;opacity:0.7;font-size:12px;
}
#vsdr-sp-panel .vsdr-sp-val{
  width:54px;flex-shrink:0;text-align:right;font-size:12px;
}
#vsdr-sp-panel input[type=range]{
  flex:1;min-width:0;accent-color:#FFB833;
}
#vsdr-sp-panel select{
  flex:1;background:#0a0800;color:#FFB833;border:1px solid rgba(255,184,51,0.5);
  border-radius:4px;padding:5px 8px;font:12px "Courier New",monospace;
}
.vsdr-sp-toggle{ display:flex;gap:6px; }
.vsdr-sp-btn{
  flex:1;text-align:center;padding:7px 0;cursor:pointer;
  border:1px solid rgba(255,184,51,0.55);border-radius:5px;
  font:12px "Courier New",monospace;color:#FFB833;background:transparent;
}
.vsdr-sp-btn.vsdr-sp-active{ background:#FFB833;color:#000;font-weight:bold; }
.vsdr-sp-divider{
  height:1px;background:rgba(255,184,51,0.12);margin:2px 0;
}
.vsdr-vfo-sw{
  width:26px;height:26px;border-radius:50%;cursor:pointer;
  border:2px solid transparent;flex-shrink:0;
}
.vsdr-vfo-sw.vsdr-vfo-active{ border-color:#fff; }
/* Menu inject button */
#vsdr-mp-spectrum-btn{
  width:100%;text-align:center;padding:8px;
}
</style>

<div id="vsdr-root" aria-hidden="true">
  <canvas id="vsdr-wf"></canvas>
  <canvas id="vsdr-ov"></canvas>
</div>
<div id="vsdr-sp-panel" role="dialog" aria-modal="true"></div>
`;

// ── Waterfall JS — embedded directly in injectJavaScript (CSP-bypassing) ─
export const VIBE_WATERFALL_JS: string = `(function(){
'use strict';

// ── Defensive DOM bootstrap ───────────────────────────────────────────────
// Create our canvas/panel elements programmatically in case the HTML-template
// append in buildInject was blocked by the page's DOM structure or CSP.
// Runs synchronously in injectJavaScript context — guaranteed to succeed.
(function ensureVsdrDOM() {
  if (!document.getElementById('vsdr-css')) {
    var st = document.createElement('style');
    st.id = 'vsdr-css';
    st.textContent = [
      'body{background:#000!important;}',
      '#vsdr-root{position:fixed;inset:0;z-index:9000;pointer-events:none;overflow:hidden;background:transparent;}',
      '#vsdr-wf,#vsdr-ov{position:absolute;inset:0;width:100%;height:100%;display:block;}',
      '#vsdr-wf{background:#000;}',
      '#vsdr-ov{pointer-events:auto;}',
      'canvas:not(#vsdr-wf):not(#vsdr-ov):not(#lsv-vfo):not(#lsv-zoom):not(#lsv-dec-canvas):not(#lsv-snr-spark):not(#lsv-snr-spark-lscape){opacity:0!important;pointer-events:none!important;}',
      '#lsv-mp-spectrum-row,#lsv-mp-spectrum-toggle,#lsv-mp-hold,#lsv-mp-hold-row,#lsv-mp-smooth,#lsv-mp-smooth-row,.lsv-mp-slider-wrap,#lsv-mp-palette-row{display:none!important;}',
      '#vsdr-sp-panel{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(10,8,4,0.97);border-top:2px solid rgba(255,184,51,0.45);border-radius:14px 14px 0 0;display:none;flex-direction:column;color:#FFB833;font:13px "Courier New",monospace;pointer-events:auto;max-height:60vh;overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,0px);}',
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }
  if (!document.getElementById('vsdr-root')) {
    var root = document.createElement('div');
    root.id = 'vsdr-root';
    root.setAttribute('aria-hidden', 'true');
    var wf = document.createElement('canvas'); wf.id = 'vsdr-wf';
    var ov = document.createElement('canvas'); ov.id = 'vsdr-ov';
    root.appendChild(wf); root.appendChild(ov);
    document.body.appendChild(root);
  }
  if (!document.getElementById('vsdr-sp-panel')) {
    var sp = document.createElement('div');
    sp.id = 'vsdr-sp-panel';
    sp.setAttribute('role', 'dialog');
    sp.setAttribute('aria-modal', 'true');
    document.body.appendChild(sp);
  }
})();

// ── Embedded data ─────────────────────────────────────────────────────────
var _CD = ${_cmapData};
var _BDA = ${_bandData};  // all regional band plans
var _BD = _BDA.world;     // active plan — updated by geo detection below

// ── ITU region detection — injected by React Native from instances API longitude ──
(function detectItuRegion() {
  function applyRegion(r) {
    _BD = (r > 0 ? _BDA['r' + r] : null) || _BDA.world;
  }
  // 1. React Native injects window.VIBE_ITU_REGION from instances API (most reliable)
  if (typeof window.VIBE_ITU_REGION === 'number' && window.VIBE_ITU_REGION > 0) {
    applyRegion(window.VIBE_ITU_REGION); return;
  }
  // 2. Poll — injection may arrive shortly after IIFE, also checks skin's _ituRegion
  var _geoTries = 0;
  var _geoTimer = setInterval(function() {
    if (typeof window.VIBE_ITU_REGION === 'number' && window.VIBE_ITU_REGION > 0) {
      applyRegion(window.VIBE_ITU_REGION); clearInterval(_geoTimer); return;
    }
    // Fallback: skin's _ituRegion (set from /api/description GPS if server has GPS)
    if (typeof _ituRegion === 'number' && _ituRegion > 0) {
      applyRegion(_ituRegion); clearInterval(_geoTimer); return;
    }
    if (++_geoTries >= 60) clearInterval(_geoTimer);
  }, 1000);
})();

// ── State ─────────────────────────────────────────────────────────────────
var V = {
  W: 0, H: 0,
  WF_W: 1024, WF_H: 300,
  BAND_H: 20, SPEC_H: 150, TICK_H: 22,
  wfTop: 0,       // pixel y where waterfall starts (computed on resize)

  wfBuf: null,    // Uint8Array WF_W*WF_H (newest row at end = top of texture)
  specLine: null, // Float32Array WF_W (latest dBFS line)
  specSmooth: null, // Float32Array WF_W (exponentially smoothed)
  dirty: false,

  autoMin: -130, autoMax: -30,
  dbMin: -120, dbMax: -20,   // dBFS range shown on Y-axis (noise floor → noise+snrRange in auto)
  dbAvg: null,    // Float32Array — temporal EMA in dBFS domain (sd path)
  lumaAvg: null,  // Float32Array — temporal EMA in luma domain (canvas fallback)
  // Waterfall display settings (persisted)
  manualGain: false,  // unused — now driven by _sd.config.manualRangeEnabled directly
  specSmoothingFrames: 5, // spectrum trace EMA: 1=instant, higher=smoother trace
  gainSettingsVer: 0,  // incremented to flush stale wfBuf/dbAvg on settings change
  wfBright: 0,         // waterfall brightness offset (-20 to +20), display-only
  wfContrast: 0,       // waterfall S-curve contrast (-10 to +10)
  wfSharp: 5,          // waterfall sharpness 0-10 (shader unsharp mask)
  vfoColor: '#ff2020', // VFO needle colour (CSS hex)
  specFloor: 0,        // spectrum dB offset (-20 to +20 dB): positive lifts trace up, negative lowers it
  specPeak: 1.0,       // spectrum peak scale (0.1-3.0x)
  specVisible: true,   // show spectrum trace above waterfall
  peakHold: false,     // show peak-hold decay markers over spectrum
  peakLine: null,      // Float32Array — peak hold values (same length as specSmooth)

  cmapName: 'Jet',
  cmapLut: null,  // Uint8Array 256*4

  centerHz: 0, bwHz: 0, tuneHz: 0,
  filterLow: -3000, filterHigh: 3000,
  _wfZoom: 0, _wfStart: 0,  // updated by WebSocket hook; 0=full zoom out

  // wfBuf is stored in a fixed −160→0 dBfs reference range so the shader
  // can remap floor/ceiling on the fly without touching the stored history.
  WF_REF_MIN: -160, WF_REF_MAX: 0,

  // WebGL
  gl: null, prog: null,
  wfTex: null, cmapTex: null,
  uHead: null, uCmap: null, uWf: null,
  uWfTop: null, uWfH: null, uScroll: null, uBright: null, uGamma: null,
  lastDataT: 0, rowIntervalMs: 50, // for smooth waterfall scroll interpolation
  _scrollF: 0,       // continuous scroll accumulator in rows (Fix 3: no phase-reset)
  _lastRenderMs: 0,  // last renderWF timestamp for dt calculation

  // Canvas2D overlay
  ov: null, ctx: null,

  hooked: false,
  _sdWrapped: false,  // scrollWaterfallOneRow has been wrapped
  _sdReady: false,    // sd hook has received real spectrumData at least once
  _pidHooked: false,
  srcIsLuma: false,
  _lastSd0: NaN, _lastSdM: NaN,  // fingerprint for duplicate-frame detection
};

// ── Colormap LUT builder ──────────────────────────────────────────────────
function hexToRgb(h) {
  return [
    parseInt(h.slice(1,3),16),
    parseInt(h.slice(3,5),16),
    parseInt(h.slice(5,7),16)
  ];
}

function buildLut(name) {
  var stops;
  var p256raw = _CD.p256[name] || _CD.p256[name.toLowerCase()];
  if (p256raw) {
    stops = [];
    for (var i = 0; i < 256; i++) stops.push('#' + p256raw.slice(i*6, i*6+6));
  } else {
    stops = _CD.stops[name] || _CD.stops[name.toLowerCase()] || _CD.stops['Classic'];
  }
  var lut = new Uint8Array(256 * 4);
  var n = stops.length;
  for (var p = 0; p < 256; p++) {
    var t = p / 255 * (n - 1);
    var lo = Math.floor(t), hi = Math.min(lo + 1, n - 1);
    var f = t - lo;
    var c0 = hexToRgb(stops[lo]), c1 = hexToRgb(stops[hi]);
    lut[p*4]   = Math.round(c0[0] + f*(c1[0]-c0[0]));
    lut[p*4+1] = Math.round(c0[1] + f*(c1[1]-c0[1]));
    lut[p*4+2] = Math.round(c0[2] + f*(c1[2]-c0[2]));
    lut[p*4+3] = 255;
  }
  return lut;
}

// ── WebGL init ────────────────────────────────────────────────────────────
var VS = [
  'attribute vec2 a_pos;',
  'varying vec2 v_uv;',
  'void main(){',
  '  v_uv=vec2(a_pos.x*0.5+0.5, a_pos.y*0.5+0.5);',
  '  gl_Position=vec4(a_pos,0.0,1.0);',
  '}'
].join('\\n');

// Fragment shader: brightness offset + S-curve contrast, then colormap LUT.
// S-curve (u_contrast): 0=identity, +1=full smoothstep (more pop), -1=flatten midtones.
// u_sharp: horizontal unsharp-mask amount (0=off, 0.5=moderate); texel step = 1/WF_W.
var FS = [
  'precision mediump float;',
  'varying vec2 v_uv;',
  'uniform sampler2D u_wf;',
  'uniform sampler2D u_cmap;',
  'uniform float u_wfTop;',
  'uniform float u_scroll;',
  'uniform float u_bright;',
  'uniform float u_contrast;',
  'uniform float u_sharp;',
  'uniform float u_dx;',
  'void main(){',
  '  float sy=1.0-v_uv.y;',
  '  if(sy<u_wfTop){gl_FragColor=vec4(0.04,0.03,0.02,0.9);return;}',
  '  float wfY=(sy-u_wfTop)/(1.0-u_wfTop);',
  '  float texY=clamp(1.0-wfY+u_scroll,0.0,1.0);',
  '  float c=texture2D(u_wf,vec2(v_uv.x,texY)).r;',
  '  float l=texture2D(u_wf,vec2(v_uv.x-u_dx,texY)).r;',
  '  float r2=texture2D(u_wf,vec2(v_uv.x+u_dx,texY)).r;',
  '  float raw=clamp(c+u_sharp*(c-(l+r2)*0.5)+u_bright,0.0,1.0);',
  '  float s=raw*raw*(3.0-2.0*raw);',
  '  float r=u_contrast>0.0?mix(raw,s,u_contrast):mix(raw,raw*0.5+0.25,-u_contrast);',
  '  gl_FragColor=texture2D(u_cmap,vec2(clamp(r,0.0,1.0),0.5));',
  '}'
].join('\\n');

function compileShader(gl, type, src) {
  var s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function initGL() {
  var canvas = document.getElementById('vsdr-wf');
  if (!canvas) return false;
  var gl = canvas.getContext('webgl', {
    alpha: false, premultipliedAlpha: false,
    antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false
  });
  if (!gl) return false;
  V.gl = gl;

  var vs = compileShader(gl, gl.VERTEX_SHADER, VS);
  var fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  V.prog = prog;
  gl.useProgram(prog);

  // Fullscreen quad
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // Waterfall texture (LUMINANCE, newest row at texture y=WF_H-1 = top)
  V.wfTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, V.wfTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, V.WF_W, V.WF_H, 0,
                gl.LUMINANCE, gl.UNSIGNED_BYTE, null);

  // Colormap LUT texture (RGBA 256x1)
  V.cmapTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, V.cmapTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  V.uWf    = gl.getUniformLocation(prog, 'u_wf');
  V.uCmap  = gl.getUniformLocation(prog, 'u_cmap');
  V.uWfTop = gl.getUniformLocation(prog, 'u_wfTop');
  V.uScroll = gl.getUniformLocation(prog, 'u_scroll');
  V.uBright    = gl.getUniformLocation(prog, 'u_bright');
  V.uGamma     = gl.getUniformLocation(prog, 'u_contrast');
  V.uSharp     = gl.getUniformLocation(prog, 'u_sharp');
  V.uDx        = gl.getUniformLocation(prog, 'u_dx');
  if (V.uSharp !== null) gl.uniform1f(V.uSharp, 0.5);
  if (V.uDx    !== null) gl.uniform1f(V.uDx,    1.0 / V.WF_W);
  gl.uniform1i(V.uWf,   0);
  gl.uniform1i(V.uCmap, 1);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  updateCmap(V.cmapName);
  return true;
}

function updateCmap(name) {
  V.cmapName = name;
  V.cmapLut = buildLut(name);
  var gl = V.gl;
  if (!gl) return;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, V.cmapTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, V.cmapLut);
  // Persist
  try { localStorage.setItem('vsdr_cmap', name); } catch(e) {}
}

// ── Resize handler ────────────────────────────────────────────────────────
function onResize() {
  var dpr = window.devicePixelRatio || 1;
  var cssW = window.innerWidth, cssH = window.innerHeight;
  V.W = cssW; V.H = cssH; V.dpr = dpr;
  var _specFrac = (cssH > cssW) ? 0.35 : 0.25; // taller spectrum in portrait → shorter waterfall
  V.SPEC_H = V.specVisible ? Math.max(120, Math.round(cssH * _specFrac)) : 0;
  V.wfTop = (V.BAND_H + V.SPEC_H + V.TICK_H) / cssH;

  var physW = Math.round(cssW * dpr), physH = Math.round(cssH * dpr);
  var wf  = document.getElementById('vsdr-wf');
  var ov  = document.getElementById('vsdr-ov');
  if (wf) {
    wf.width = physW; wf.height = physH;
    wf.style.width = cssW + 'px'; wf.style.height = cssH + 'px';
  }
  if (ov) {
    ov.width = physW; ov.height = physH;
    ov.style.width = cssW + 'px'; ov.style.height = cssH + 'px';
  }

  if (V.gl) {
    V.gl.viewport(0, 0, physW, physH);
    V.gl.uniform1f(V.uWfTop, V.wfTop);
  }
}

// ── Data normalisation ────────────────────────────────────────────────────
function normalise(dbfs) {
  // Auto-level: fast rise, slow fall
  var alpha_rise = 0.6, alpha_fall = 0.015;
  var alpha = (dbfs > V.autoMax) ? alpha_rise : alpha_fall;
  V.autoMax += alpha * (dbfs - V.autoMax);
  alpha = (dbfs < V.autoMin) ? alpha_rise : alpha_fall;
  V.autoMin += alpha * (dbfs - V.autoMin);

  // Contrast: higher = narrower range
  var range = Math.max(20, 120 - V.autoContrast * 4);
  var floor = V.autoMax - range;
  var n = (dbfs - floor) / range;
  return Math.max(0, Math.min(1, n));
}

// ── Add FFT scanline (Float32 dBFS) — primary path for ka9q-radio ────────
// spectrumData from ka9q-radio is raw dBfs — no server-side gain or smoothing.
// sdMinDb/sdMaxDb (actualMinDb/actualMaxDb) come from UberSDR's own 2-5 second
// history auto-ranging. We IGNORE them and compute our own range directly from
// the raw f32 data so there is no inherited lag or double-smoothing.
function addFftLine(f32, centerHz, bwHz) {
  // readFreqInfo() owns V.centerHz/V.bwHz — it polls live on every overlay frame.
  // We only use the incoming centerHz for band-change detection (see flush logic below).
  V.srcIsLuma = false;

  var _sd = window.spectrumDisplay;
  var _cfg = _sd && _sd.config;
  var actualMinDb = (_sd && isFinite(_sd.actualMinDb)) ? _sd.actualMinDb : -120;
  var actualMaxDb = (_sd && isFinite(_sd.actualMaxDb)) ? _sd.actualMaxDb : -40;
  V.dbMin = actualMinDb;
  V.dbMax = actualMaxDb;

  var W = V.WF_W, H = V.WF_H;
  var srcLen = f32.length;

  if (!V.wfBuf)    V.wfBuf    = new Uint8Array(W * H);
  if (!V.specLine) V.specLine = new Float32Array(W);
  if (!V.specSmooth) V.specSmooth = new Float32Array(W);

  // Flush stale history when gain settings change (manual toggle / slider drag)
  if (!V._gainSettingsVerApplied) V._gainSettingsVerApplied = 0;
  if (V._gainSettingsVerApplied !== V.gainSettingsVer) {
    V._gainSettingsVerApplied = V.gainSettingsVer;
    V.dbAvg = null;
    V.autoFloorDb = null;
    V.wfBuf.fill(0);
  }

  // Flush when band changes significantly (> half the visible bandwidth)
  var prevCenterHz = V._prevAddCenterHz || 0;
  if (centerHz && prevCenterHz && V.bwHz > 0 &&
      Math.abs(centerHz - prevCenterHz) > V.bwHz * 0.4) {
    V.dbAvg = null;
    V.autoFloorDb = null;
    V.wfBuf.fill(0);
  }
  if (centerHz) V._prevAddCenterHz = centerHz;

  if (!V.dbAvg || V.dbAvg.length !== W) {
    // Initialise EMA directly from the actual FFT data so there is zero
    // settling delay after a band change — no gradual brightening effect.
    V.dbAvg = new Float32Array(W);
    for (var ii = 0; ii < W; ii++) {
      var si0 = Math.floor(ii / W * srcLen);
      V.dbAvg[ii] = isFinite(f32[si0]) ? f32[si0] : nMin;
    }
    // Also prime specSmooth so the spectrum trace is correct on the first frame
    if (V.specSmooth) {
      for (var jj = 0; jj < W; jj++) V.specSmooth[jj] = V.dbAvg[jj];
    }
  }

  V.wfBuf.copyWithin(0, W);
  var rowOffset = W * (H - 1);

  // Pass 1: temporal EMA in raw dBFS domain.
  // Smoothing is time-based (seconds) so apparent smoothing is consistent
  // regardless of whether the user has selected SMOOTH/DEFAULT/POWERSAVE.
  var nowMs = Date.now();
  if (!V._lastFftMs) V._lastFftMs = nowMs;
  var dtMs = nowMs - V._lastFftMs;
  var dtSec = Math.min(0.5, Math.max(0.01, dtMs / 1000));
  V.lastDataT = nowMs;
  V._lastFftMs = nowMs;

  // Waterfall: no temporal EMA — server data is already smoothed server-side.
  var fallAlpha = 1.0;
  var riseAlpha = 1.0;
  var _wfOverlap = 0;
  for (var i = 0; i < W; i++) {
    var si = Math.floor(i / W * srcLen);
    var dbfs = f32[si];
    var ta = (dbfs > V.dbAvg[i]) ? riseAlpha : fallAlpha;
    V.dbAvg[i] += ta * (dbfs - V.dbAvg[i]);
  }

  // Spectrum EMA: time-based so consistent across FPS modes
  var noSmoothSpec = (V.specSmoothingFrames <= 1);
  var tcSpecSec = noSmoothSpec ? 0 : (V.specSmoothingFrames - 1) / 20;
  var specFallAlpha = noSmoothSpec ? 1.0 : Math.min(0.95, 1.0 - Math.exp(-dtSec / Math.max(0.01, tcSpecSec)));
  var specRiseAlpha = noSmoothSpec ? 1.0 : Math.min(0.95, specFallAlpha * 4);

  // Pass 2: spatial 5-tap smoothing (waterfall only, skipped if wf smooth is off)
  var tmp = new Float32Array(W);
  if (_wfOverlap === 0) {
    for (var i2 = 0; i2 < W; i2++) tmp[i2] = V.dbAvg[i2];
  } else {
    tmp[0] = (V.dbAvg[0]*3 + V.dbAvg[1]*2) / 5;
    tmp[1] = (V.dbAvg[0] + V.dbAvg[1]*2 + V.dbAvg[2]*2) / 5;
    tmp[W-1] = (V.dbAvg[W-2]*2 + V.dbAvg[W-1]*3) / 5;
    tmp[W-2] = (V.dbAvg[W-3] + V.dbAvg[W-2]*2 + V.dbAvg[W-1]*2) / 5;
    for (var k = 2; k < W-2; k++) {
      tmp[k] = (V.dbAvg[k-2] + V.dbAvg[k-1]*2 + V.dbAvg[k]*3 + V.dbAvg[k+1]*2 + V.dbAvg[k+2]) / 9;
    }
  }

  var _dbRange = Math.max(1, actualMaxDb - actualMinDb);
  var _adjMinDb = actualMinDb;

  // Seed peak hold array from current specSmooth before the per-bin loop.
  // Only seed when specSmooth has actual signal (at least one non-zero bin),
  // otherwise zeros would map to 0 dBFS = top of spectrum.
  if (V.peakHold && !V.peakLine && V.specSmooth) {
    var _hasSignal = false;
    for (var _si = 0; _si < V.specSmooth.length; _si++) {
      if (V.specSmooth[_si] !== 0) { _hasSignal = true; break; }
    }
    if (_hasSignal) V.peakLine = new Float32Array(V.specSmooth);
  }

  // Pass 3: apply spectrum EMA independently, bake magnitude into wfBuf.
  var _clipThr = (_cfg && typeof _cfg.contrast === 'number' && _cfg.contrast > 0) ? _cfg.contrast : 14.97;
  for (var j = 0; j < W; j++) {
    V.specLine[j] = tmp[j];
    var specTa = (tmp[j] > V.specSmooth[j]) ? specRiseAlpha : specFallAlpha;
    V.specSmooth[j] += specTa * (tmp[j] - V.specSmooth[j]);
    // Peak hold update per-bin (peakLine seeded before loop)
    if (V.peakHold && V.peakLine) {
      var _pk = V.peakLine[j];
      var _cur = V.specSmooth[j];
      V.peakLine[j] = _cur > _pk ? _cur : _pk - 10 * dtSec; // 10 dB/s decay
    }

    var _norm = Math.max(0, Math.min(1, (tmp[j] - _adjMinDb) / _dbRange));
    var _mag = _norm * 255;
    if (_mag < _clipThr) { _mag = 0; }
    else { _mag = (_mag - _clipThr) / (255 - _clipThr) * 255; }
    V.wfBuf[rowOffset + j] = Math.round(_mag);
  }
  V.dirty = true;
}

// ── Add canvas scanline (from KiwiSDR canvas intercept) ──────────────────
function addCanvasLine(rgba, width, canvas) {
  // Only intercept the largest canvas (likely waterfall)
  if (!canvas || canvas.id === 'vsdr-wf' || canvas.id === 'vsdr-ov') return;
  if (width < 200) return;

  var W = V.WF_W, H = V.WF_H;
  if (!V.wfBuf) V.wfBuf = new Uint8Array(W * H);
  if (!V.specLine) V.specLine = new Float32Array(W);
  if (!V.specSmooth) V.specSmooth = new Float32Array(W);

  // Canvas fallback for non-ka9q-radio SDRs (KiwiSDR etc).
  // Reads UberSDR's pre-coloured pixels — simple luma extraction only.
  V.srcIsLuma = true;
  V.wfBuf.copyWithin(0, W);

  var rowOffset = W * (H - 1);
  var srcLen = width;

  if (!V.lumaAvg || V.lumaAvg.length !== W) {
    V.lumaAvg = new Float32Array(W);
    for (var ii = 0; ii < W; ii++) V.lumaAvg[ii] = 0.15;
  }

  var nowMsC = Date.now();
  V.lastDataT = nowMsC;

  var fallAlpha = 1.0; // no waterfall EMA — server already smooths
  var riseAlpha = fallAlpha >= 1.0 ? 1.0 : 0.35;
  var dtSecC = V._lastCanvasMs ? Math.min(0.5, (nowMsC - V._lastCanvasMs) / 1000) : 0.05;
  V._lastCanvasMs = nowMsC;
  var _sAlpha = V.specSmoothingFrames <= 1 ? 1.0 : Math.min(0.8, 1.0 / (V.specSmoothingFrames * 1.5));

  // Seed peak hold from current specSmooth if not yet initialised
  if (V.peakHold && !V.peakLine && V.specSmooth) {
    var _hasSignalC = false;
    for (var _sic = 0; _sic < V.specSmooth.length; _sic++) {
      if (V.specSmooth[_sic] !== 0) { _hasSignalC = true; break; }
    }
    if (_hasSignalC) V.peakLine = new Float32Array(V.specSmooth);
  }

  for (var i = 0; i < W; i++) {
    var si = Math.floor(i / W * srcLen);
    var r = rgba[si*4], g = rgba[si*4+1], b = rgba[si*4+2];
    var raw = (0.299*r + 0.587*g + 0.114*b) / 255;
    var ta = (raw > V.lumaAvg[i]) ? riseAlpha : fallAlpha;
    V.lumaAvg[i] += ta * (raw - V.lumaAvg[i]);
    V.specLine[i] = V.lumaAvg[i];
    var sta = (V.lumaAvg[i] > V.specSmooth[i]) ? Math.min(0.95, _sAlpha * 3) : _sAlpha;
    V.specSmooth[i] += sta * (V.lumaAvg[i] - V.specSmooth[i]);
    // Peak hold update — luma domain (0-1), so decay is scaled down from dBFS rate
    if (V.peakHold && V.peakLine) {
      var _pkC = V.peakLine[i];
      var _curC = V.specSmooth[i];
      V.peakLine[i] = _curC > _pkC ? _curC : _pkC - 0.10 * dtSecC;
    }
    V.wfBuf[rowOffset + i] = Math.round(Math.max(0, Math.min(1, V.lumaAvg[i])) * 255);
  }
  V.dirty = true;
}

// ── Hook data sources ─────────────────────────────────────────────────────
function hookSources() {
  // ① ka9q-radio / UberSDR: hook scrollWaterfallOneRow to read raw spectrumData
  // This bypasses UberSDR's colormap, contrast, and any client-side smoothing.
  // Keep trying each frame until spectrumDisplay is available.
  if (!V._sdWrapped && window.spectrumDisplay &&
      typeof window.spectrumDisplay.scrollWaterfallOneRow === 'function') {
    var _sd = window.spectrumDisplay;
    var _origScroll = _sd.scrollWaterfallOneRow;
    _sd.scrollWaterfallOneRow = function() {
      var _gotData = false;
      try {
        if (_sd.spectrumData && _sd.spectrumData.length > 0) {
          // Gate: reject frames closer together than 40ms (~25fps max).
          // This proves whether scrollWaterfallOneRow is firing at 60fps or
          // at the true server data rate. If the waterfall visibly slows,
          // the hook was firing at 60fps; if unchanged, data IS at 60fps.
          var _nowGate = Date.now();
          if (_nowGate - V._lastSd0 < 40) return;
          V._lastSd0 = _nowGate;

          // Flush when server center frequency changes significantly
          var _newCenter = _sd.centerFreq || 0;
          if (_newCenter > 0 && V._hookPrevCenter > 0 &&
              Math.abs(_newCenter - V._hookPrevCenter) > Math.max(_newCenter * 0.01, 50000)) {
            V.wfBuf && V.wfBuf.fill(0);
            V.dbAvg = null;
            V._prevAddCenterHz = 0;
          }
          V._hookPrevCenter = _newCenter;
          if (typeof _sd.updateAutoRange === 'function' && _sd.config && !_sd.config.manualRangeEnabled) {
            try { _sd.updateAutoRange(); } catch(e) {}
          }
          addFftLine(new Float32Array(_sd.spectrumData),
                     _sd.centerFreq, _sd.totalBandwidth);
          V._sdReady = true;
          _gotData = true;
        }
      } catch(e) {}
      if (!_gotData) {
        try { _origScroll.apply(_sd, arguments); } catch(e) {}
      }
    };
    // Stub out the remaining canvas draw calls in UberSDR's rAF loop.
    // The loop itself must keep running (it processes WebSocket data and drives
    // our scrollWaterfallOneRow hook), but we own all rendering now.
    _sd.drawLineGraph = function() {};
    _sd.drawTunedFrequencyCursor = function() {};

    // Apply any saved sd.config settings that couldn't be applied at init time
    // (spectrumDisplay wasn't ready then)
    if (V._pendingSdConfig && _sd.config) {
      var _p = V._pendingSdConfig;
      if (typeof _p.manualRangeEnabled === 'boolean') _sd.config.manualRangeEnabled = _p.manualRangeEnabled;
      if (typeof _p.manualMinDb === 'number') _sd.config.manualMinDb = _p.manualMinDb;
      if (typeof _p.manualMaxDb === 'number') _sd.config.manualMaxDb = _p.manualMaxDb;
      if (typeof _p.autoContrast === 'number') _sd.config.autoContrast = _p.autoContrast;
      V._pendingSdConfig = null;
    }

    V._sdWrapped = true;
  }

  // ② OpenWebRX: hook waterfall_add
  if (!V.hooked && typeof window.waterfall_add === 'function') {
    var orig = window.waterfall_add;
    window.waterfall_add = function(data) {
      try { addFftLine(data, window.center_freq, window.bandwidth); } catch(e) {}
      return orig.apply(this, arguments);
    };
    V.hooked = true;
  }

  // ③ Canvas fallback for KiwiSDR / other SDRs — only used until sd hook gets data
  if (!V._pidHooked) {
    V._pidHooked = true;
    var origPID = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function(imgData, x, y) {
      try {
        if (!V._sdReady && imgData && imgData.height === 1 && imgData.width > 200) {
          addCanvasLine(imgData.data, imgData.width, this.canvas);
        }
      } catch(e) {}
      return origPID.apply(this, arguments);
    };
  }
}

// ── Read frequency info ───────────────────────────────────────────────────
function readFreqInfo() {
  try {
    // OpenWebRX globals
    if (window.center_freq && window.bandwidth) {
      V.centerHz = window.center_freq;
      V.bwHz     = window.bandwidth;
    }
    // UberSDR is built on ka9q-radio (radiod), NOT KiwiSDR.
    // spectrumDisplay.centerFreq (Hz) and totalBandwidth (Hz) are updated live
    // by the server after every zoom/pan request — just read them directly.
    if (window.spectrumDisplay && window.spectrumDisplay.totalBandwidth > 0) {
      var sd = window.spectrumDisplay;
      V.bwHz    = sd.totalBandwidth;
      V.centerHz = sd.centerFreq + (sd.predictedFreqOffset || 0);
    } else if (window.spectrumDisplay && window.spectrumDisplay.centerFreq > 0) {
      var sd = window.spectrumDisplay;
      // totalBandwidth not yet populated — derive from binBandwidth * binCount
      if (sd.binBandwidth > 0 && sd.binCount > 0) {
        V.bwHz = sd.binBandwidth * sd.binCount;
      }
      V.centerHz = sd.centerFreq;
    }
    // Tuned frequency from UberSDR #frequency element
    var fEl = document.getElementById('frequency');
    if (fEl) {
      var hz = parseInt(fEl.getAttribute('data-hz-value') || '0', 10);
      if (hz > 0) V.tuneHz = hz;
      // If frequency input has a numeric value in kHz
      if (!hz) {
        var kv = parseFloat(fEl.value);
        if (!isNaN(kv) && kv > 0) V.tuneHz = Math.round(kv * 1000);
      }
    }
    // If we still have no centerHz but have a tuned frequency,
    // fall back: assume tuned freq is near centre, use last bwHz or 1 MHz default
    if (!V.centerHz && V.tuneHz > 0) {
      V.centerHz = V.tuneHz;
      if (!V.bwHz) V.bwHz = 1000000; // 1 MHz fallback
    }
    // ka9q-radio: tuned freq and filter offsets are on spectrumDisplay directly
    if (window.spectrumDisplay && window.spectrumDisplay.currentTunedFreq > 0) {
      var sd2 = window.spectrumDisplay;
      V.tuneHz    = sd2.currentTunedFreq;
      V.filterLow  = sd2.currentBandwidthLow  || -3000;
      V.filterHigh = sd2.currentBandwidthHigh ||  3000;
    } else if (typeof window.current_filter_offset_low !== 'undefined') {
      V.filterLow  = window.current_filter_offset_low  || -3000;
      V.filterHigh = window.current_filter_offset_high ||  3000;
    } else {
      var bwEl = document.getElementById('bandwidth-combined');
      if (bwEl) {
        var bwHz2 = parseFloat(bwEl.value) || 3000;
        var modeEl = document.getElementById('lsv-mode-btn') ||
                     document.querySelector('[id*="mode"]');
        var mode = modeEl ? (modeEl.textContent || '').trim().toUpperCase() : 'AM';
        if (mode === 'USB' || mode === 'DIGI-U') {
          V.filterLow = 0; V.filterHigh = bwHz2;
        } else if (mode === 'LSB' || mode === 'DIGI-L') {
          V.filterLow = -bwHz2; V.filterHigh = 0;
        } else {
          V.filterLow = -bwHz2/2; V.filterHigh = bwHz2/2;
        }
      }
    }

    // Detect frequency band jump: if tuneHz changed enough that the new station
    // is outside the currently visible bandwidth, clear stale waterfall history.
    if (!V._prevTuneHz) V._prevTuneHz = 0;
    var tuneJump = Math.abs(V.tuneHz - V._prevTuneHz);
    var halfBw = (V.bwHz || 1000000) * 0.5;
    if (V._prevTuneHz > 0 && tuneJump > halfBw) {
      if (V.wfBuf) V.wfBuf.fill(0);
      V.dbAvg = null;
      V._prevAddCenterHz = 0;
    }
    V._prevTuneHz = V.tuneHz;
  } catch(e) {}
}

// ── No zoom hooking needed ────────────────────────────────────────────────
// UberSDR/ka9q-radio: spectrumDisplay.centerFreq and .totalBandwidth update
// live from the server after every zoom — we just poll them in readFreqInfo.
function hookZoom() {
  V._zoomHooked = true; // nothing to hook
}

// ── WebGL render ──────────────────────────────────────────────────────────
// GPU draw is capped at 30fps to save battery. The scroll accumulator still
// updates every rAF tick (cheap JS) so the interpolated position is precise
// at whichever frame we actually commit to the GPU.
var _GPU_INTERVAL_MS = 1000 / 30; // 30fps GPU cap
var _lastGpuMs = 0;
function renderWF() {
  var gl = V.gl;
  if (!gl || !V.wfBuf) return;

  // Continuous scroll accumulator — advances every rAF frame, resets phase when
  // new data arrives. rowIntervalMs is now gated to real server intervals (not 60fps).
  var nowMs = Date.now();
  if (V._lastRenderMs > 0 && V.rowIntervalMs > 0) {
    V._scrollF += (nowMs - V._lastRenderMs) / V.rowIntervalMs;
  }
  V._lastRenderMs = nowMs;

  var newData = false;
  if (V.dirty) {
    // Measure real data interval here — ground truth, independent of hook gate timing
    if (V._lastDirtyMs > 0) {
      var dtDirty = nowMs - V._lastDirtyMs;
      if (dtDirty > 10 && dtDirty < 2000) {
        V.rowIntervalMs = V.rowIntervalMs > 0 ? V.rowIntervalMs * 0.8 + dtDirty * 0.2 : dtDirty;
      }
    }
    V._lastDirtyMs = nowMs;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, V.wfTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, V.WF_W, V.WF_H, 0,
                  gl.LUMINANCE, gl.UNSIGNED_BYTE, V.wfBuf);
    V.dirty = false;
    newData = true;
    V._scrollF -= 1.0;
    // Clamp runaway accumulation (e.g. wrong rowIntervalMs at startup).
    // Normal steady-state: _scrollF oscillates -0.1 to 1.0. Anything outside
    // that means the estimate was wrong — snap back rather than staying offset.
    if (V._scrollF > 1.0 || V._scrollF < -0.3) V._scrollF = 0;
  }

  // Gate actual GPU draw to 30fps. Always draw when new texture data arrived.
  var sinceGpu = nowMs - _lastGpuMs;
  if (!newData && sinceGpu < _GPU_INTERVAL_MS) return;
  _lastGpuMs = nowMs;

  if (V.uScroll !== null && V.lastDataT > 0 && V.rowIntervalMs > 0) {
    gl.uniform1f(V.uScroll, Math.min(1.0, V._scrollF) / V.WF_H);
  }

  if (V.uBright !== null) gl.uniform1f(V.uBright, V.wfBright * 0.025);
  if (V.uGamma  !== null) gl.uniform1f(V.uGamma,  V.wfContrast / 10.0);
  if (V.uSharp  !== null) gl.uniform1f(V.uSharp,  V.wfSharp / 10.0);

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(V.prog);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ── Canvas2D overlay render ───────────────────────────────────────────────
function renderOverlay() {
  var ctx = V.ctx;
  if (!ctx) return;
  var dpr = V.dpr || 1;
  var W = V.W, H = V.H;  // CSS pixels — layout coords for all drawing below
  ctx.clearRect(0, 0, W * dpr, H * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);  // maps CSS-pixel drawing to physical pixels for sharpness

  var bandH = V.BAND_H, specH = V.SPEC_H, tickH = V.TICK_H;
  var tickTop  = bandH;               // ticker sits directly under band plan
  var specTop  = tickTop + tickH;     // spectrum below ticker
  var wfTop    = specTop + specH;     // waterfall below spectrum

  // Solid opaque background for the entire non-waterfall header area so the
  // WebGL canvas never shows through band plan, ticker, or spectrum regions.
  ctx.fillStyle = 'rgb(2,2,2)';
  ctx.fillRect(0, 0, W, wfTop);

  readFreqInfo();

  var cx  = V.centerHz  || 0;
  var bw  = V.bwHz      || 0;
  var tune = V.tuneHz   || cx;
  var visStart = cx - bw * 0.5;
  var visEnd   = cx + bw * 0.5;

  // ── Band plan strip ────────────────────────────────────────────────────
  if (bw > 0) {
    var BAND_COLS = ['rgba(207,0,0,0.75)', 'rgba(9,0,255,0.75)', 'rgba(7,189,0,0.75)', 'rgba(148,0,189,0.75)', 'rgba(0,170,204,0.75)', 'rgba(255,119,0,0.75)'];
    var bands = _BD;

    // Full name lookup for broadcast/utility/cb bands
    var _bcastNames = {
      'LW':'LW Broadcast Band','MW':'MW Broadcast Band','75m':'75m Broadcast Band',
      '49m':'49m Broadcast Band','41m':'41m Broadcast Band','31m':'31m Broadcast Band',
      '25m':'25m Broadcast Band','22m':'22m Broadcast Band','19m':'19m Broadcast Band',
      '16m':'16m Broadcast Band','13m':'13m Broadcast Band','11m':'11m Broadcast Band',
      'FM':'FM Broadcast','90m':'90m Broadcast Band','120m':'120m Broadcast Band'
    };
    var _utilNames  = { 'VLF':'Very Low Frequency', 'NDB':'NDB / Nav Beacons', 'NOAA WX':'NOAA Weather Radio' };

    function _bandFullName(b) {
      var s = b[3], t = b[2];
      if (t === 0) return s + ' Ham Band';
      if (t === 1) return _bcastNames[s] || s + ' Broadcast Band';
      if (t === 2) return _utilNames[s]  || s;
      if (t === 3) return s + ' (Citizens Band)';
      return s; // aviation/maritime already descriptive
    }

    // Read band conditions from skin's cache (same page scope, graceful fallback)
    function _bandCondStr(b) {
      if (b[2] !== 0) return ''; // conditions only for amateur bands
      try {
        var snr = (typeof getBandSnrDb === 'function') ? getBandSnrDb(b[3]) : null;
        if (snr === null) return '';
        var label = snr >= 30 ? 'Excellent' : snr >= 20 ? 'Good' : snr >= 6 ? 'Fair' : 'Poor';
        return '(' + label + ' ' + snr + 'dB)';
      } catch(e) { return ''; }
    }

    for (var bi = 0; bi < bands.length; bi++) {
      var b = bands[bi];
      if (b[1] < visStart || b[0] > visEnd) continue;
      var bx0 = Math.max(0, (b[0] - visStart) / bw * W);
      var bx1 = Math.min(W, (b[1] - visStart) / bw * W);
      var bpx = bx1 - bx0;
      if (bpx <= 0) continue;
      ctx.fillStyle = BAND_COLS[b[2]];
      ctx.fillRect(bx0, 0, bpx, bandH);

      if (bpx < 28) continue; // too narrow for any label

      // Choose label detail based on available pixel width
      var _short = b[3];
      var _full  = _bandFullName(b);
      var _cond  = bpx > 200 ? _bandCondStr(b) : '';
      var _label = bpx < 60 ? _short : (_cond ? _full + ' ' + _cond : _full);

      // Clip text to band strip width
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx0 + 2, 0, bpx - 4, bandH);
      ctx.clip();

      ctx.font = 'bold 9px "Nixie One","Courier New",monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 3;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      var _cx = (bx0 + bx1) / 2;
      ctx.strokeText(_label, _cx, bandH - 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(_label, _cx, bandH - 4);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    // Band plan bottom border
    ctx.strokeStyle = 'rgba(255,200,80,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bandH - 0.5);
    ctx.lineTo(W, bandH - 0.5);
    ctx.stroke();
  }

  // ── Bookmarks ─────────────────────────────────────────────────────────
  if (bw > 0) {
    try {
      var bms = [];
      try { bms = bms.concat(window.localBookmarksUI.manager.getAll()); } catch(e) {}
      if (window.bookmarks && window.bookmarks.length) bms = bms.concat(window.bookmarks);
      ctx.font = '8px "Courier New", monospace';
      for (var bmi = 0; bmi < bms.length; bmi++) {
        var bm = bms[bmi];
        var bmHz = bm.hz || bm.freq || 0;
        if (!bmHz || bmHz < visStart || bmHz > visEnd) continue;
        var bmX = (bmHz - visStart) / bw * W;
        ctx.strokeStyle = bm.color || 'rgba(255,200,100,0.7)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(bmX, 2);
        ctx.lineTo(bmX, bandH);
        ctx.stroke();
        // Small triangle marker
        ctx.fillStyle = bm.color || 'rgba(255,200,100,0.7)';
        ctx.beginPath();
        ctx.moveTo(bmX - 3, 2);
        ctx.lineTo(bmX + 3, 2);
        ctx.lineTo(bmX, bandH - 1);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } catch(e) {}
  }

  // ── Spectrum trace ────────────────────────────────────────────────────
  if (V.wfBuf && V.WF_W > 0) {
    // specSmooth holds dBfs values. Normalize using the same UberSDR pipeline
    // that addFftLine used to write wfBuf — so spectrum and waterfall always match.
    var _sdSpec = window.spectrumDisplay;
    var _cfgSpec = _sdSpec && _sdSpec.config;
    var _sdSpec2 = window.spectrumDisplay;
    var _specMax = (_sdSpec2 && isFinite(_sdSpec2.actualMaxDb)) ? _sdSpec2.actualMaxDb : V.dbMax;
    if (_cfgSpec && _cfgSpec.manualRangeEnabled) {
      _specMax = (_cfgSpec.manualMaxDb || -40);
    }
    var _rawSpecMin = (_sdSpec2 && isFinite(_sdSpec2.actualMinDb)) ? _sdSpec2.actualMinDb : V.dbMin;
    if (_cfgSpec && _cfgSpec.manualRangeEnabled) { _rawSpecMin = (_cfgSpec.manualMinDb || -120); }
    var _specRange = Math.max(1, _specMax - _rawSpecMin);
    var _specMin = _rawSpecMin;

    var sl   = V.specSmooth || V.specLine;
    var sLen = sl ? sl.length : 0;

    // Spectrum normalisation with independent offset/scale controls.
    // specFloor is a dB offset (+up/-down); convert to normalised shift for specN.
    var _sf = _specRange > 0 ? V.specFloor / _specRange : 0;  // dB offset → normalised
    var _sp = V.specPeak;         // 0.1–3.0x
    function specN(db) {
      var n = V.srcIsLuma ? Math.max(0, Math.min(1, db))
                          : Math.max(0, Math.min(1, (db - _specMin) / _specRange));
      return Math.max(0, Math.min(1, (n + _sf) * _sp));
    }

    // Spectrum sits in its allocated area: specTop → wfTop (same split as before)
    var specBaseline = wfTop;
    if (sl && sLen > 0) {
      // Colormap gradient — floor lifted so noise bin shows bottom palette colour
      var grad = ctx.createLinearGradient(0, specTop, 0, specBaseline);
      if (V.cmapLut) {
        for (var gi = 0; gi <= 8; gi++) {
          var gFrac = gi / 8;
          var gIdx  = Math.max(0, Math.min(255, Math.round(15 + gFrac * 220)));
          var gr = V.cmapLut[gIdx*4], gg = V.cmapLut[gIdx*4+1], gb = V.cmapLut[gIdx*4+2];
          grad.addColorStop(1 - gFrac, 'rgba('+gr+','+gg+','+gb+',1.0)');
        }
      } else {
        grad.addColorStop(0, 'rgb(0,180,60)');
        grad.addColorStop(1, 'rgb(0,255,120)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, specBaseline);
      for (var si = 0; si < W; si++) {
        var sIdx = Math.floor(si / W * sLen);
        var sY = specBaseline - specN(sl[sIdx]) * specH;
        if (si === 0) ctx.lineTo(0, sY); else ctx.lineTo(si, sY);
      }
      ctx.lineTo(W, specBaseline);
      ctx.closePath();
      ctx.fill();

      // Peak-hold decay line
      if (V.peakHold && V.peakLine && V.peakLine.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.shadowColor = 'rgba(200,255,200,0.5)';
        ctx.shadowBlur = 2;
        var pkLen = V.peakLine.length;
        for (var pi = 0; pi < W; pi++) {
          var pkIdx = Math.floor(pi / W * pkLen);
          var pkY = specBaseline - specN(V.peakLine[pkIdx]) * specH;
          if (pi === 0) ctx.moveTo(pi, pkY); else ctx.lineTo(pi, pkY);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.shadowBlur = 0;
    }

    // ── dB scale ─────────────────────────────────────────────────────────
    var _dbScaleMin = _specMin, _dbScaleRange = _specMax - _specMin;
    ctx.font = 'bold 11px "Courier New",monospace';
    ctx.textAlign = 'left';
    for (var di = 0; di <= 4; di++) {
      var dFrac = di / 4;
      var labelY = specBaseline - dFrac * specH;
      var dlabel = Math.round(_dbScaleMin + dFrac * _dbScaleRange) + 'dB';
      // Reference line across full width
      ctx.strokeStyle = 'rgba(255,180,0,0.12)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, labelY); ctx.lineTo(W, labelY); ctx.stroke();
      // Dark backing then bright text
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(dlabel, 4, labelY - 2);
      ctx.fillStyle = 'rgba(255,180,60,0.90)';
      ctx.fillText(dlabel, 4, labelY - 2);
    }
  }

  // ── Frequency ticker ──────────────────────────────────────────────────
  if (bw > 0) {
    ctx.fillStyle = 'rgba(0,10,4,0.85)';
    ctx.fillRect(0, tickTop, W, tickH);

    // Choose spacing so we get ~6-8 ticks; ensure labels don't overlap
    var targetTicks = Math.max(4, Math.min(8, Math.floor(W / 70)));
    var tickSpacing = niceTick(bw / targetTicks);
    var pxPerHz = W / bw;
    var minGapPx = 52; // minimum px between label centres
    // If spacing still too dense, double it
    while (tickSpacing * pxPerHz < minGapPx) tickSpacing *= 2;

    var firstTick = Math.ceil(visStart / tickSpacing) * tickSpacing;

    ctx.font = 'bold 11px "Nixie One","Courier New",monospace';
    ctx.shadowColor = '#00cc44';
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = '#00aa33';
    ctx.strokeStyle = 'rgba(0,180,60,0.45)';
    ctx.lineWidth   = 1;
    ctx.textAlign   = 'center';

    var lastLabelX = -999;
    for (var tf = firstTick; tf <= visEnd; tf += tickSpacing) {
      var tx = (tf - visStart) / bw * W;
      ctx.beginPath();
      ctx.moveTo(tx, tickTop);
      ctx.lineTo(tx, tickTop + 5);
      ctx.stroke();
      if (tx - lastLabelX >= minGapPx) {
        ctx.fillText(fmtHz(tf), tx, tickTop + tickH - 4);
        lastLabelX = tx;
      }
    }
    ctx.shadowBlur = 0;
    ctx.textAlign  = 'left';
  }

  // ── Sideband markers + needle (SDR++ Brown style) ─────────────────────
  if (bw > 0 && tune > 0) {
    var needleX = (tune - visStart) / bw * W;
    var loHz = tune + V.filterLow;
    var hiHz = tune + V.filterHigh;
    // Allow loX/hiX to go outside [0,W] — clip happens at fillRect/stroke level
    // This lets sidebands fill the entire screen when zoomed deeply in
    var loX  = (loHz - visStart) / bw * W;
    var hiX  = (hiHz - visStart) / bw * W;
    // Minimum only if filter is unknown/zero (prevents invisible markers at default)
    var minSbPx = (V.filterLow === 0 && V.filterHigh === 0) ? 20 : 4;
    if (needleX - loX < minSbPx) loX = needleX - minSbPx;
    if (hiX - needleX < minSbPx) hiX = needleX + minSbPx;
    var loXc = Math.max(0, loX);
    var hiXc = Math.min(W, hiX);

    // Scale needle/glass by zoom level — thin when zoomed out, full when zoomed in
    var pxPerHz = W / bw;
    var needleScale = Math.max(0.25, Math.min(1.0, pxPerHz * 4000));

    // Acrylic sideband panels — spectrum + waterfall (below band plan bar)
    var glassTop = bandH;
    var _nc2 = V.vfoColor || '#ff2020';
    var _nr2 = parseInt(_nc2.slice(1,3),16), _ng2 = parseInt(_nc2.slice(3,5),16), _nb2 = parseInt(_nc2.slice(5,7),16);
    function _nRgba2(a) { return 'rgba('+_nr2+','+_ng2+','+_nb2+','+a+')'; }
    // Left panel: bright near needle, faint glow at far edge
    var sbGradL = ctx.createLinearGradient(loXc, 0, needleX, 0);
    sbGradL.addColorStop(0,    _nRgba2(0.03));
    sbGradL.addColorStop(0.15, _nRgba2(0.06));
    sbGradL.addColorStop(0.55, _nRgba2(0.14));
    sbGradL.addColorStop(1,    _nRgba2(0.28));
    ctx.fillStyle = sbGradL;
    ctx.fillRect(loXc, glassTop, needleX - loXc, H - glassTop);

    // Right panel: mirror
    var sbGradR = ctx.createLinearGradient(needleX, 0, hiXc, 0);
    sbGradR.addColorStop(0,    _nRgba2(0.28));
    sbGradR.addColorStop(0.45, _nRgba2(0.14));
    sbGradR.addColorStop(0.85, _nRgba2(0.06));
    sbGradR.addColorStop(1,    _nRgba2(0.03));
    ctx.fillStyle = sbGradR;
    ctx.fillRect(needleX, glassTop, hiXc - needleX, H - glassTop);

    // Acrylic edge lines
    ctx.shadowColor = _nc2;
    ctx.shadowBlur  = 8;
    ctx.strokeStyle = _nRgba2(0.35);
    ctx.lineWidth   = needleScale;
    if (loXc > 0) { ctx.beginPath(); ctx.moveTo(loXc, glassTop); ctx.lineTo(loXc, H); ctx.stroke(); }
    if (hiXc < W) { ctx.beginPath(); ctx.moveTo(hiXc, glassTop); ctx.lineTo(hiXc, H); ctx.stroke(); }
    ctx.shadowBlur = 0;
  }

  // ── Tuning needle — LED glow in user-selected colour ─────────────────────
  if (bw > 0 && tune > 0) {
    var nX = (tune - visStart) / bw * W;
    var needleScale2 = Math.max(0.25, Math.min(1.0, (W / bw) * 4000));
    var _nc = V.vfoColor || '#ff2020';
    var _nr = parseInt(_nc.slice(1,3),16), _ng = parseInt(_nc.slice(3,5),16), _nb = parseInt(_nc.slice(5,7),16);
    function _nRgba(a) { return 'rgba('+_nr+','+_ng+','+_nb+','+a+')'; }
    // Wide outer halo
    ctx.shadowColor = _nc;
    ctx.shadowBlur  = 28 * needleScale2;
    ctx.strokeStyle = _nRgba(0.35);
    ctx.lineWidth   = 1.5 * needleScale2;
    ctx.beginPath(); ctx.moveTo(nX, 0); ctx.lineTo(nX, H); ctx.stroke();
    // Mid glow
    ctx.shadowColor = _nc;
    ctx.shadowBlur  = 16 * needleScale2;
    ctx.strokeStyle = _nRgba(0.7);
    ctx.lineWidth   = 0.8 * needleScale2;
    ctx.beginPath(); ctx.moveTo(nX, 0); ctx.lineTo(nX, H); ctx.stroke();
    // Core filament
    ctx.shadowColor = _nc;
    ctx.shadowBlur  = 6 * needleScale2;
    ctx.strokeStyle = _nc;
    ctx.lineWidth   = 0.5;
    ctx.beginPath(); ctx.moveTo(nX, 0); ctx.lineTo(nX, H); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function niceTick(approx) {
  var pow = Math.pow(10, Math.floor(Math.log10(approx)));
  var norm = approx / pow;
  var nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * pow;
}

function fmtHz(hz) {
  if (hz >= 1e9)  return (hz/1e9).toFixed(2)+'G';
  if (hz >= 1e6)  return (hz/1e6).toFixed(3)+'M';
  if (hz >= 1e3)  return (hz/1e3).toFixed(hz < 1e5 ? 1 : 0)+'k';
  return hz.toFixed(0)+'Hz';
}

// ── RAF loop ──────────────────────────────────────────────────────────────
// Waterfall and spectrum both render at server data rate (dirty flag).
// UberSDR's SMOOTH/DEFAULT/POWERSAVE buttons are the sole rate control.
// Overlay also re-renders on a 100ms fallback so the VFO needle stays
// responsive even when no new data frame has arrived (e.g. after tuning).
var _lastOverlayMs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  try {
    hookSources();
    var hadNewData = V.dirty;
    renderWF();
    if (hadNewData || ts - _lastOverlayMs >= 100) {
      renderOverlay();
      _lastOverlayMs = ts;
    }
  } catch(e) {}
}

// ── Rate button integration ───────────────────────────────────────────────
// UberSDR's SMOOTH/DEFAULT/POWERSAVE buttons send set_rate to the server.
// We just flush our EMA buffers on rate change so old averaged data doesn't
// bleed into the new rate. Rendering is driven purely by server data arrival.
function hookFpsButtons() {
  var _rateKey  = 'vsdr_rate';
  var _idleKey  = 'vsdr_rate_idle_off';

  [1, 2, 3].forEach(function(n) {
    var btn = document.getElementById('lsv-mp-rate-'+n);
    if (!btn) return;
    btn.addEventListener('click', function() {
      V.dbAvg = null; V.lumaAvg = null;
      V.specSmooth && V.specSmooth.fill(0);
      try { localStorage.setItem(_rateKey, String(n)); } catch(e) {}
    });
  });

  // Hook idle-powersave disable toggle (UberSDR button that suppresses the 30s auto-switch)
  // Try common UberSDR IDs for the idle setting
  var idleBtn = document.getElementById('lsv-mp-rate-idle') ||
                document.getElementById('lsv-mp-idle') ||
                document.getElementById('lsv-rate-idle');
  if (idleBtn) {
    idleBtn.addEventListener('click', function() {
      // Toggle: save whether idle auto-powersave is disabled
      var nowOff = idleBtn.classList.contains('active') || idleBtn.classList.contains('lsv-active');
      try { localStorage.setItem(_idleKey, nowOff ? '1' : '0'); } catch(e) {}
    });
  }

  // Restore saved rate (short delay so UberSDR's own init finishes)
  setTimeout(function() {
    var saved = null;
    try { saved = localStorage.getItem(_rateKey); } catch(e) {}
    if (saved) {
      var rateBtn = document.getElementById('lsv-mp-rate-'+saved);
      if (rateBtn) rateBtn.click();
    }
    // Restore idle-off state
    var idleOff = null;
    try { idleOff = localStorage.getItem(_idleKey); } catch(e) {}
    if (idleOff === '1' && idleBtn) {
      var alreadyOff = idleBtn.classList.contains('active') || idleBtn.classList.contains('lsv-active');
      if (!alreadyOff) idleBtn.click();
    }
  }, 800);
}

// hookContrast removed — we own autoContrast via V.autoContrast, pushed every frame

// ── Palette UI — hijack the skin's existing palette select ────────────────
function buildPaletteUI() {
  var row = document.getElementById('lsv-mp-palette-row');
  if (!row) return;
  var sel = row.querySelector('select');
  if (!sel) return;

  // Build full palette name list (short-stop first, then 256-stop)
  var allNames = Object.keys(_CD.stops).concat(
    Object.keys(_CD.p256).map(function(k){ return k.charAt(0).toUpperCase() + k.slice(1); })
  );
  var seen = {}, names = [];
  allNames.forEach(function(n) {
    var key = n.toLowerCase();
    if (!seen[key]) { seen[key] = true; names.push(n); }
  });

  // Replace all options with our palettes
  sel.innerHTML = '';
  names.forEach(function(name) {
    var o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    if (name.toLowerCase() === V.cmapName.toLowerCase()) o.selected = true;
    sel.appendChild(o);
  });
  sel.value = V.cmapName;

  // Wire selection to our colormap
  sel.addEventListener('change', function() { updateCmap(sel.value); });
}

// ── Spectrum settings panel ───────────────────────────────────────────────
// Save keys:
//   vsdr_wf_defaults          — global defaults (user's preferred baseline)
//   vsdr_wf_inst_<hostname>   — per-server overrides
//   vsdr_wf_settings          — legacy (migrated to global on first load)
function buildSpectrumPanel() {
  var _instKey = 'vsdr_wf_inst_' + location.hostname;
  var _globalKey = 'vsdr_wf_defaults';

  function _parseSettings(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch(e) { return {}; }
  }

  function _applySettings(s) {
    var sd = window.spectrumDisplay;
    if (sd && sd.config) {
      if (typeof s.manualRangeEnabled === 'boolean') sd.config.manualRangeEnabled = s.manualRangeEnabled;
      if (typeof s.manualMinDb === 'number') sd.config.manualMinDb = s.manualMinDb;
      if (typeof s.manualMaxDb === 'number') sd.config.manualMaxDb = s.manualMaxDb;
      if (typeof s.autoContrast === 'number') sd.config.autoContrast = s.autoContrast;
    }
    if (typeof s.specSmoothingFrames === 'number') V.specSmoothingFrames = Math.max(1, Math.min(10, s.specSmoothingFrames));
    if (typeof s.wfBright === 'number') V.wfBright = s.wfBright;
    if (typeof s.wfContrast === 'number') V.wfContrast = s.wfContrast;
    if (typeof s.wfSharp === 'number') V.wfSharp = Math.max(0, Math.min(10, s.wfSharp));
    if (typeof s.vfoColor === 'string') V.vfoColor = s.vfoColor;
    if (typeof s.specFloor === 'number') V.specFloor = (s.specFloor >= -20 && s.specFloor <= 20) ? s.specFloor : 0;
    if (typeof s.specPeak === 'number') V.specPeak = Math.max(0.1, Math.min(3.0, s.specPeak));
    if (typeof s.cmapName === 'string') { V.cmapName = s.cmapName; updateCmap(s.cmapName); }
    if (typeof s.specVisible === 'boolean') { V.specVisible = s.specVisible; onResize(); }
    if (typeof s.peakHold === 'boolean') { V.peakHold = s.peakHold; if (!s.peakHold) V.peakLine = null; }
    // Legacy migration
    if (typeof s.smoothingFrames === 'number' && !s.specSmoothingFrames) {
      V.specSmoothingFrames = Math.max(1, Math.min(10, s.smoothingFrames));
    }
  }

  // Load: legacy → global → instance (each overrides previous)
  var _legacy = _parseSettings('vsdr_wf_settings');
  var _global = _parseSettings(_globalKey);
  var _inst   = _parseSettings(_instKey);
  // If no global saved yet, migrate legacy settings as global
  if (!localStorage.getItem(_globalKey) && localStorage.getItem('vsdr_wf_settings')) {
    try { localStorage.setItem(_globalKey, JSON.stringify(_legacy)); } catch(e) {}
  }
  _applySettings(_legacy);
  _applySettings(_global);
  _applySettings(_inst);

  // spectrumDisplay.config may not exist yet at init time — store the merged
  // sd-config overlay so hookSources() can re-apply it once SD is available.
  var _sdCfgOverlay = {};
  [_legacy, _global, _inst].forEach(function(s) {
    if (typeof s.manualRangeEnabled === 'boolean') _sdCfgOverlay.manualRangeEnabled = s.manualRangeEnabled;
    if (typeof s.manualMinDb === 'number') _sdCfgOverlay.manualMinDb = s.manualMinDb;
    if (typeof s.manualMaxDb === 'number') _sdCfgOverlay.manualMaxDb = s.manualMaxDb;
    if (typeof s.autoContrast === 'number') _sdCfgOverlay.autoContrast = s.autoContrast;
  });
  V._pendingSdConfig = _sdCfgOverlay;

  function _currentSnapshot() {
    var _saveCfg = window.spectrumDisplay && window.spectrumDisplay.config;
    return {
      manualRangeEnabled: (_saveCfg && _saveCfg.manualRangeEnabled) || false,
      manualMinDb: (_saveCfg && typeof _saveCfg.manualMinDb === 'number') ? _saveCfg.manualMinDb : -120,
      manualMaxDb: (_saveCfg && typeof _saveCfg.manualMaxDb === 'number') ? _saveCfg.manualMaxDb : -40,
      autoContrast: (_saveCfg && typeof _saveCfg.autoContrast === 'number') ? _saveCfg.autoContrast : 5,
      specSmoothingFrames: V.specSmoothingFrames,
      wfBright: V.wfBright, wfContrast: V.wfContrast, wfSharp: V.wfSharp,
      vfoColor: V.vfoColor,
      specFloor: V.specFloor, specPeak: V.specPeak, cmapName: V.cmapName,
      specVisible: V.specVisible, peakHold: V.peakHold
    };
  }

  function saveSettings() {
    try { localStorage.setItem(_instKey, JSON.stringify(_currentSnapshot())); } catch(e) {}
  }
  function saveGlobalDefaults() {
    var snap = _currentSnapshot();
    try { localStorage.setItem(_globalKey, JSON.stringify(snap)); } catch(e) {}
    // Also persist via React Native AsyncStorage so global defaults survive origin changes
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'pref-set', key: 'vsdr_wf_global', value: snap })
      );
    } catch(e) {}
  }
  function resetToDefaults() {
    try { localStorage.removeItem(_instKey); } catch(e) {}
    var sd = window.spectrumDisplay;
    if (sd && sd.config) {
      sd.config.manualRangeEnabled = false;
      var _srvAc = (sd.config && typeof sd.config.autoContrast === 'number') ? sd.config.autoContrast : 5;
      sd.config.autoContrast = _srvAc;
      try { sd.autoRangeMinHistory = []; sd.autoRangeMaxHistory = []; } catch(e) {}
    }
    V.wfBright = 0; V.wfContrast = 0; V.wfSharp = 5;
    V.specFloor = 0; V.specPeak = 1.0; V.specSmoothingFrames = 5;
    V.vfoColor = '#ff2020';
    V.cmapName = 'Jet'; updateCmap('Jet');
    V.specVisible = true; V.peakHold = false; V.peakLine = null;
    onResize();
    V.gainSettingsVer++;
    V.wfBuf && V.wfBuf.fill(0);
  }

  var panel = document.getElementById('vsdr-sp-panel');
  if (!panel) return;

  function openPanel() {
    try { window.lsvMenuPanelClose(); } catch(e) {}
    renderPanel();
    panel.style.display = 'flex';
  }

  function closePanel() {
    panel.style.display = 'none';
  }

  function renderPanel() {
    var mG = V.manualGain;

    // Build colormap options
    var cmapNames = Object.keys(_CD.stops).concat(
      Object.keys(_CD.p256).map(function(k){ return k.charAt(0).toUpperCase() + k.slice(1); })
    );
    var seen = {}, cmapOpts = '';
    cmapNames.forEach(function(n) {
      var key = n.toLowerCase();
      if (seen[key]) return; seen[key] = true;
      cmapOpts += '<option value="' + n + '"' + (n.toLowerCase() === V.cmapName.toLowerCase() ? ' selected' : '') + '>' + n + '</option>';
    });

    // Read UberSDR live config for panel values
    var _sdP = window.spectrumDisplay;
    var _cfgP = _sdP && _sdP.config;
    var _isManual = _cfgP && _cfgP.manualRangeEnabled;
    var _autoContrast = (_cfgP && typeof _cfgP.autoContrast === 'number') ? _cfgP.autoContrast : 10;
    var _curMin = (_cfgP && typeof _cfgP.manualMinDb === 'number') ? _cfgP.manualMinDb : -120;
    var _curMax = (_cfgP && typeof _cfgP.manualMaxDb === 'number') ? _cfgP.manualMaxDb : -40;
    var _noiseRef = (_sdP && isFinite(_sdP.actualMinDb)) ? Math.round(_sdP.actualMinDb) : '?';

    var _specFloorDb  = Math.round(V.specFloor);        // ±10 dB offset
    var _specPeakVal  = Math.round(V.specPeak * 10);    // 1–30 → 0.1–3.0x

    // VFO colour swatches
    var _vfoCols = [
      { hex:'#ff2020', glow:'#ff0000', label:'Red'    },
      { hex:'#00ff44', glow:'#00cc33', label:'Green'  },
      { hex:'#4499ff', glow:'#2266ff', label:'Blue'   },
      { hex:'#ffdd00', glow:'#ffcc00', label:'Yellow' },
      { hex:'#00eeff', glow:'#00ccdd', label:'Cyan'   },
      { hex:'#ff8800', glow:'#ff6600', label:'Orange' },
      { hex:'#ffffff', glow:'#cccccc', label:'White'  },
      { hex:'#cc44ff', glow:'#aa22ff', label:'Purple' },
    ];
    var _vfoSwatches = _vfoCols.map(function(c) {
      var active = (V.vfoColor.toLowerCase() === c.hex.toLowerCase()) ? ' vsdr-vfo-active' : '';
      return '<div class="vsdr-vfo-sw' + active + '" data-color="' + c.hex + '" title="' + c.label + '"' +
        ' style="background:' + c.hex + ';box-shadow:0 0 8px ' + c.glow + ',0 0 18px rgba(' +
        parseInt(c.hex.slice(1,3),16) + ',' + parseInt(c.hex.slice(3,5),16) + ',' + parseInt(c.hex.slice(5,7),16) + ',0.35);"></div>';
    }).join('');

    panel.innerHTML =
      '<div class="vsdr-sp-head">' +
        '<span>&#9728; DISPLAY SETTINGS</span>' +
        '<span class="vsdr-sp-close" id="vsdr-sp-close">&#10005;</span>' +
      '</div>' +
      '<div class="vsdr-sp-body">' +

        // ── Save / Reset row ──────────────────────────────────────
        '<div style="display:flex;gap:6px;">' +
          '<button class="vsdr-sp-btn" id="vsdr-btn-reset" style="flex:1;font-size:11px;padding:6px 0;">↺ RESET</button>' +
          '<button class="vsdr-sp-btn" id="vsdr-btn-save-inst" style="flex:2;font-size:11px;padding:6px 0;">💾 THIS SERVER</button>' +
          '<button class="vsdr-sp-btn" id="vsdr-btn-save-global" style="flex:2;font-size:11px;padding:6px 0;">🌐 GLOBAL</button>' +
        '</div>' +

        // ── Colour Map ────────────────────────────────────────────
        '<div class="vsdr-sp-section">Colour Map</div>' +
        '<div class="vsdr-sp-row">' +
          '<select id="vsdr-cmap-sel">' + cmapOpts + '</select>' +
        '</div>' +

        // ── VFO Needle ────────────────────────────────────────────
        '<div class="vsdr-sp-section">VFO Needle Colour</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;padding:2px 0;" id="vsdr-vfo-swatches">' +
          _vfoSwatches +
        '</div>' +

        // ── Coarse ────────────────────────────────────────────────
        '<div class="vsdr-sp-section">Waterfall — Coarse (Auto-Gain)</div>' +
        '<div class="vsdr-sp-toggle">' +
          '<button class="vsdr-sp-btn' + (_isManual ? '' : ' vsdr-sp-active') + '" id="vsdr-sp-auto">AUTO</button>' +
          '<button class="vsdr-sp-btn' + (_isManual ? ' vsdr-sp-active' : '') + '" id="vsdr-sp-man">MANUAL</button>' +
        '</div>' +

        '<div id="vsdr-sp-auto-wrap" style="display:' + (_isManual ? 'none' : 'flex') + ';flex-direction:column;gap:12px;">' +
          '<div>' +
            '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
              '<span class="vsdr-sp-label">Auto Range</span>' +
              '<span class="vsdr-sp-val" id="vsdr-sp-ac-lbl">±' + _autoContrast + ' dB</span>' +
            '</div>' +
            '<input type="range" id="vsdr-sp-ac" min="0" max="20" step="1" value="' + _autoContrast + '">' +
          '</div>' +
          '<div class="vsdr-sp-row" style="opacity:0.55;font-size:11px;">' +
            '<span>Noise ref</span><span>' + _noiseRef + ' dBfs</span>' +
          '</div>' +
        '</div>' +

        '<div id="vsdr-sp-manual-wrap" style="display:' + (_isManual ? 'flex' : 'none') + ';flex-direction:column;gap:12px;">' +
          '<div>' +
            '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
              '<span class="vsdr-sp-label">Floor</span>' +
              '<span class="vsdr-sp-val" id="vsdr-sp-min-lbl">' + _curMin + ' dBfs</span>' +
            '</div>' +
            '<input type="range" id="vsdr-sp-min" min="-160" max="-10" value="' + _curMin + '">' +
          '</div>' +
          '<div>' +
            '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
              '<span class="vsdr-sp-label">Ceiling</span>' +
              '<span class="vsdr-sp-val" id="vsdr-sp-max-lbl">' + _curMax + ' dBfs</span>' +
            '</div>' +
            '<input type="range" id="vsdr-sp-max" min="-150" max="0" value="' + _curMax + '">' +
          '</div>' +
        '</div>' +

        // ── Fine Tuning ───────────────────────────────────────────
        '<div class="vsdr-sp-section">Waterfall — Fine Tuning</div>' +
        '<div>' +
          '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
            '<span class="vsdr-sp-label">Brightness</span>' +
            '<span class="vsdr-sp-val" id="vsdr-sp-wb-lbl">' + (V.wfBright >= 0 ? '+' : '') + V.wfBright + ' dB</span>' +
          '</div>' +
          '<input type="range" id="vsdr-sp-wb" min="-20" max="20" step="1" value="' + V.wfBright + '">' +
        '</div>' +
        '<div>' +
          '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
            '<span class="vsdr-sp-label">Contrast</span>' +
            '<span class="vsdr-sp-val" id="vsdr-sp-wc-lbl">' + (V.wfContrast >= 0 ? '+' : '') + V.wfContrast + '</span>' +
          '</div>' +
          '<input type="range" id="vsdr-sp-wc" min="-10" max="10" step="1" value="' + V.wfContrast + '">' +
        '</div>' +
        '<div>' +
          '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
            '<span class="vsdr-sp-label">Sharpness</span>' +
            '<span class="vsdr-sp-val" id="vsdr-sp-ws-lbl">' + V.wfSharp + '</span>' +
          '</div>' +
          '<input type="range" id="vsdr-sp-ws" min="0" max="10" step="1" value="' + V.wfSharp + '">' +
        '</div>' +

        // ── Spectrum ──────────────────────────────────────────────
        '<div class="vsdr-sp-section">Spectrum</div>' +
        '<div class="vsdr-sp-toggle">' +
          '<button class="vsdr-sp-btn' + (V.specVisible ? ' vsdr-sp-active' : '') + '" id="vsdr-sp-spec-on">SHOW</button>' +
          '<button class="vsdr-sp-btn' + (!V.specVisible ? ' vsdr-sp-active' : '') + '" id="vsdr-sp-spec-off">HIDE</button>' +
        '</div>' +
        '<div class="vsdr-sp-toggle" style="margin-top:8px;">' +
          '<button class="vsdr-sp-btn' + (!V.peakHold ? ' vsdr-sp-active' : '') + '" id="vsdr-sp-peak-off">PEAK OFF</button>' +
          '<button class="vsdr-sp-btn' + (V.peakHold ? ' vsdr-sp-active' : '') + '" id="vsdr-sp-peak-on">PEAK HOLD</button>' +
        '</div>' +
        '<div id="vsdr-sp-spec-sliders" style="display:' + (V.specVisible ? 'flex' : 'none') + ';flex-direction:column;gap:12px;margin-top:12px;">' +
        '<div>' +
          '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
            '<span class="vsdr-sp-label">Position</span>' +
            '<span class="vsdr-sp-val" id="vsdr-sp-sf-lbl">' + (_specFloorDb >= 0 ? '+' : '') + _specFloorDb + ' dB</span>' +
          '</div>' +
          '<input type="range" id="vsdr-sp-sf" min="-20" max="20" step="1" value="' + _specFloorDb + '">' +
        '</div>' +
        '<div>' +
          '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
            '<span class="vsdr-sp-label">Peak Height</span>' +
            '<span class="vsdr-sp-val" id="vsdr-sp-sp-lbl">' + (V.specPeak).toFixed(1) + 'x</span>' +
          '</div>' +
          '<input type="range" id="vsdr-sp-sp" min="1" max="30" step="1" value="' + _specPeakVal + '">' +
        '</div>' +
        '<div>' +
          '<div class="vsdr-sp-row" style="margin-bottom:4px;">' +
            '<span class="vsdr-sp-label">Smoothing</span>' +
            '<span class="vsdr-sp-val" id="vsdr-sp-specsm-lbl">' + V.specSmoothingFrames + '</span>' +
          '</div>' +
          '<input type="range" id="vsdr-sp-specsm" min="1" max="10" value="' + V.specSmoothingFrames + '">' +
        '</div>' +
        '</div>' + // close vsdr-sp-spec-sliders

      '</div>';

    document.getElementById('vsdr-sp-close').onclick = closePanel;

    document.getElementById('vsdr-sp-auto').onclick = function() {
      var sd = window.spectrumDisplay;
      if (sd && sd.config) { sd.config.manualRangeEnabled = false; }
      V.gainSettingsVer++;
      V.wfBuf && V.wfBuf.fill(0);  // clear history — new range, old colours are wrong
      saveSettings();
      renderPanel();
    };
    document.getElementById('vsdr-sp-man').onclick = function() {
      var sd = window.spectrumDisplay;
      if (sd && sd.config) {
        // Prime from current auto range so first adjustment is intuitive
        if (!sd.config.manualRangeEnabled) {
          sd.config.manualMinDb = isFinite(sd.actualMinDb) ? Math.round(sd.actualMinDb) : -120;
          sd.config.manualMaxDb = isFinite(sd.actualMaxDb) ? Math.round(sd.actualMaxDb) : -40;
        }
        sd.config.manualRangeEnabled = true;
      }
      V.gainSettingsVer++;
      V.wfBuf && V.wfBuf.fill(0);
      saveSettings();
      renderPanel();
    };

    var cmapSel = document.getElementById('vsdr-cmap-sel');
    cmapSel.onchange = function() {
      V.cmapName = cmapSel.value; updateCmap(cmapSel.value); saveSettings();
    };

    // Manual mode: floor + ceiling sliders — write directly to UberSDR config
    var minSl = document.getElementById('vsdr-sp-min');
    if (minSl) {
      minSl.oninput = function() {
        var v = parseInt(minSl.value, 10);
        var sd = window.spectrumDisplay;
        if (sd && sd.config) {
          if (v >= sd.config.manualMaxDb - 5) { v = sd.config.manualMaxDb - 5; minSl.value = String(v); }
          sd.config.manualMinDb = v;
        }
        document.getElementById('vsdr-sp-min-lbl').textContent = v + ' dBfs';
        saveSettings();
      };
    }
    var maxSl = document.getElementById('vsdr-sp-max');
    if (maxSl) {
      maxSl.oninput = function() {
        var v = parseInt(maxSl.value, 10);
        var sd = window.spectrumDisplay;
        if (sd && sd.config) {
          if (v <= sd.config.manualMinDb + 5) { v = sd.config.manualMinDb + 5; maxSl.value = String(v); }
          sd.config.manualMaxDb = v;
        }
        document.getElementById('vsdr-sp-max-lbl').textContent = v + ' dBfs';
        saveSettings();
      };
    }
    var acSl = document.getElementById('vsdr-sp-ac');
    if (acSl) {
      acSl.oninput = function() {
        var v = parseInt(acSl.value, 10);
        var sd = window.spectrumDisplay;
        if (sd && sd.config) {
          sd.config.autoContrast = v;
          // Flush history arrays so the new squeeze takes effect immediately
          try { sd.autoRangeMinHistory = []; sd.autoRangeMaxHistory = []; } catch(e) {}
        }
        document.getElementById('vsdr-sp-ac-lbl').textContent = '±' + v + ' dB';
        V.gainSettingsVer++;
        V.wfBuf && V.wfBuf.fill(0);
        saveSettings();
      };
    }
    var wcSl = document.getElementById('vsdr-sp-wc');
    if (wcSl) {
      wcSl.oninput = function() {
        V.wfContrast = parseInt(wcSl.value, 10);
        var sign = V.wfContrast >= 0 ? '+' : '';
        document.getElementById('vsdr-sp-wc-lbl').textContent = sign + V.wfContrast;
        saveSettings();
      };
    }
    var wfBrSl = document.getElementById('vsdr-sp-wb');
    if (wfBrSl) {
      wfBrSl.oninput = function() {
        V.wfBright = parseInt(wfBrSl.value, 10);
        var sign = V.wfBright >= 0 ? '+' : '';
        document.getElementById('vsdr-sp-wb-lbl').textContent = sign + V.wfBright + ' dB';
        saveSettings();
      };
    }
    var specSmSl = document.getElementById('vsdr-sp-specsm');
    specSmSl.oninput = function() {
      V.specSmoothingFrames = parseInt(specSmSl.value, 10);
      document.getElementById('vsdr-sp-specsm-lbl').textContent = V.specSmoothingFrames;
      V.specSmooth && V.specSmooth.fill(0);
      saveSettings();
    };
    var sfSl = document.getElementById('vsdr-sp-sf');
    if (sfSl) {
      sfSl.oninput = function() {
        var v = parseInt(sfSl.value, 10);
        V.specFloor = v;
        document.getElementById('vsdr-sp-sf-lbl').textContent = (v >= 0 ? '+' : '') + v + ' dB';
        saveSettings();
      };
    }
    var spSl = document.getElementById('vsdr-sp-sp');
    if (spSl) {
      spSl.oninput = function() {
        V.specPeak = parseInt(spSl.value, 10) / 10;
        document.getElementById('vsdr-sp-sp-lbl').textContent = V.specPeak.toFixed(1) + 'x';
        saveSettings();
      };
    }

    // Sharpness slider
    var wsSl = document.getElementById('vsdr-sp-ws');
    if (wsSl) {
      wsSl.oninput = function() {
        V.wfSharp = parseInt(wsSl.value, 10);
        document.getElementById('vsdr-sp-ws-lbl').textContent = V.wfSharp;
        saveSettings();
      };
    }

    // Spectrum show/hide
    document.getElementById('vsdr-sp-spec-on').onclick = function() {
      V.specVisible = true;
      var sliders = document.getElementById('vsdr-sp-spec-sliders');
      if (sliders) sliders.style.display = 'flex';
      onResize();
      saveSettings();
      renderPanel();
    };
    document.getElementById('vsdr-sp-spec-off').onclick = function() {
      V.specVisible = false;
      var sliders = document.getElementById('vsdr-sp-spec-sliders');
      if (sliders) sliders.style.display = 'none';
      onResize();
      saveSettings();
      renderPanel();
    };

    // Peak hold toggle
    document.getElementById('vsdr-sp-peak-off').onclick = function() {
      V.peakHold = false;
      V.peakLine = null;
      saveSettings();
      renderPanel();
    };
    document.getElementById('vsdr-sp-peak-on').onclick = function() {
      V.peakHold = true;
      saveSettings();
      renderPanel();
    };

    // VFO colour swatches
    var _swatchEls = document.querySelectorAll('#vsdr-vfo-swatches .vsdr-vfo-sw');
    _swatchEls.forEach(function(el) {
      el.onclick = function() {
        V.vfoColor = el.getAttribute('data-color');
        _swatchEls.forEach(function(s) { s.classList.remove('vsdr-vfo-active'); });
        el.classList.add('vsdr-vfo-active');
        saveSettings();
      };
    });

    // Reset / Save buttons
    document.getElementById('vsdr-btn-reset').onclick = function() {
      resetToDefaults();
      renderPanel();
    };
    document.getElementById('vsdr-btn-save-inst').onclick = function() {
      saveSettings();
      var btn = document.getElementById('vsdr-btn-save-inst');
      if (btn) { btn.textContent = '✓ SAVED'; setTimeout(function(){ btn.textContent = '💾 THIS SERVER'; }, 1200); }
    };
    document.getElementById('vsdr-btn-save-global').onclick = function() {
      saveGlobalDefaults();
      var btn = document.getElementById('vsdr-btn-save-global');
      if (btn) { btn.textContent = '✓ SAVED'; setTimeout(function(){ btn.textContent = '🌐 GLOBAL'; }, 1200); }
    };
  }

  // Inject "SPECTRUM" button into the UberSDR menu after the hidden palette row
  // Retry until the menu DOM is available
  var _injectTries = 0;
  function injectMenuButton() {
    var paletteRow = document.getElementById('lsv-mp-palette-row');
    if (!paletteRow) {
      if (++_injectTries < 20) setTimeout(injectMenuButton, 500);
      return;
    }
    if (document.getElementById('vsdr-mp-spectrum-btn')) return; // already injected

    // Hide UberSDR Hold/Spectrum toggles — but NOT the Smooth/Default/Powersave
    // rate buttons (lsv-mp-rate-*) since we use those for rate persistence.
    document.querySelectorAll('button').forEach(function(btn) {
      if (/^lsv-mp-rate-/.test(btn.id)) return; // keep rate buttons
      var t = btn.textContent.trim().toLowerCase();
      if (t === 'hold' || t === 'spectrum') {
        var row = btn.closest('[class*="row"],[class*="mp"]') || btn.parentNode;
        if (row) row.style.display = 'none';
      }
    });

    // ▦ SPECTRUM SETTINGS — anchored after palette row
    var wrap = document.createElement('div');
    wrap.className = 'lsv-mp-row';
    var btn = document.createElement('button');
    btn.id = 'vsdr-mp-spectrum-btn';
    btn.className = 'lsv-mp-btn';
    btn.textContent = '▦ SPECTRUM SETTINGS';
    btn.onclick = openPanel;
    wrap.appendChild(btn);
    paletteRow.parentNode.insertBefore(wrap, paletteRow.nextSibling);

    // Anchor reset buttons after UberSDR's lsv-mp-reset-settings row
    var resetSettingsEl = document.getElementById('lsv-mp-reset-settings');
    var resetAnchor = resetSettingsEl
      ? (resetSettingsEl.closest('[class*="row"],[class*="mp"]') || resetSettingsEl.parentNode)
      : wrap; // fallback: place after spectrum button

    function _makeMenuBtn(id, label, color, handler) {
      var w = document.createElement('div');
      w.className = 'lsv-mp-row';
      var b = document.createElement('button');
      b.id = id; b.className = 'lsv-mp-btn';
      b.textContent = label;
      if (color) b.style.color = color;
      b.onclick = handler;
      w.appendChild(b);
      return w;
    }

    var wrapInst = _makeMenuBtn('vsdr-mp-reset-inst-btn', '↩ RESET INSTANCE SETTINGS', '#ffb347', function() {
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'reset-instance' })
        );
      } catch(e) {}
    });
    var wrapAll = _makeMenuBtn('vsdr-mp-reset-all-btn', '🗑 RESET ALL APP DATA', '#ff6b6b', function() {
      try {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'reset-app' })
        );
      } catch(e) {}
    });

    resetAnchor.parentNode.insertBefore(wrapInst, resetAnchor.nextSibling);
    resetAnchor.parentNode.insertBefore(wrapAll, wrapInst.nextSibling);
  }
  setTimeout(injectMenuButton, 600);
}

// ── Touch input — tap to tune, single-finger pan, pinch to zoom ──────────
// We own ALL touch events; UberSDR's canvas has pointer-events:none.
function hookTouches() {
  var ov = V.ov;
  if (!ov) return;

  var TAP_MOVE_PX   = 8;    // pixels of movement that disqualifies a tap
  var PAN_THROTTLE  = 50;   // ms between pan WebSocket messages

  var _hasMoved     = false;
  var _tapX = 0, _tapY = 0;
  var _panStartX    = 0,  _panStartCHz  = 0, _panStartBwHz = 0;
  var _pinchDist0   = 0,  _pinchBinBw0  = 0, _pinchCHz0    = 0, _pinchMidX0 = 0;
  var _pinchPivotHz = 0; // frequency at pinch centre at touchstart (fixed for duration)
  var _lastPanMs    = 0;

  // Convert canvas pixel X → Hz using current live freq info
  function pxToHz(x) {
    if (!V.bwHz || !V.W) return 0;
    return (V.centerHz - V.bwHz * 0.5) + (x / V.W) * V.bwHz;
  }

  function getSD() { try { return window.spectrumDisplay || null; } catch(e){ return null; } }

  // Tune VFO to hz — mirrors UberSDR's centerCarrier() sequence
  function tuneHz(hz) {
    try {
      var sd = getSD();
      // centerCarrier sets the freq input AND calls autoTune (sends WebSocket)
      if (sd && typeof sd.centerCarrier === 'function') {
        sd.centerCarrier(Math.round(hz));
        return;
      }
      // Fallback: set input then trigger tune
      if (typeof window.setFrequencyInputValue === 'function') {
        window.setFrequencyInputValue(Math.round(hz));
      } else {
        var inp = document.getElementById('frequency');
        if (inp) inp.value = String(Math.round(hz));
      }
      if (typeof window.autoTune === 'function') window.autoTune();
      else if (typeof window.tune === 'function') window.tune();
    } catch(e) {}
  }

  // Pan spectrum centre to hz
  function panHz(hz) {
    try {
      var sd = getSD();
      if (sd && typeof sd.panTo === 'function') sd.panTo(Math.round(hz));
    } catch(e) {}
  }

  // Send zoom WebSocket message (mirrors UberSDR's pinch-zoom handler exactly)
  function zoomTo(binBw, pivotHz) {
    try {
      var sd = getSD();
      if (!sd || !sd.ws || sd.ws.readyState !== 1) return;
      var maxBinBw = sd.initialBinBandwidth || binBw;
      binBw = Math.max(10, Math.min(maxBinBw, binBw));
      sd.ws.send(JSON.stringify({
        type: 'zoom',
        frequency: Math.round(pivotHz),
        binBandwidth: parseFloat(binBw.toFixed(1))
      }));
    } catch(e) {}
  }

  ov.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var t0 = e.touches[0];
    _tapX = t0.clientX; _tapY = t0.clientY;
    _hasMoved = false;

    if (e.touches.length === 1) {
      var rect = ov.getBoundingClientRect();
      _panStartX   = t0.clientX - rect.left;
      _panStartCHz = V.centerHz;
      _panStartBwHz = V.bwHz;
    } else if (e.touches.length === 2) {
      var t1 = e.touches[1];
      var dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
      _pinchDist0 = Math.sqrt(dx*dx + dy*dy);
      _pinchMidX0 = (t0.clientX + t1.clientX) / 2;
      _pinchCHz0  = V.centerHz;
      var sd = getSD();
      _pinchBinBw0 = (sd && sd.binBandwidth) ? sd.binBandwidth : (V.bwHz / 1024);
      var rect0 = ov.getBoundingClientRect();
      _pinchPivotHz = pxToHz(_pinchMidX0 - rect0.left); // fixed for this pinch gesture
    }
  }, { passive: false });

  ov.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (e.touches.length === 2 && _pinchDist0 > 0) {
      // Pinch to zoom
      _hasMoved = true;
      var t0 = e.touches[0], t1 = e.touches[1];
      var dx = t1.clientX - t0.clientX, dy = t1.clientY - t0.clientY;
      var dist = Math.sqrt(dx*dx + dy*dy);
      var scale = dist / _pinchDist0;
      zoomTo(_pinchBinBw0 / scale, _pinchPivotHz);
    } else if (e.touches.length === 1) {
      // Single-finger pan
      var t0 = e.touches[0];
      var dxAbs = Math.abs(t0.clientX - _tapX), dyAbs = Math.abs(t0.clientY - _tapY);
      if (dxAbs > TAP_MOVE_PX || dyAbs > TAP_MOVE_PX) _hasMoved = true;
      if (_hasMoved && _panStartBwHz > 0) {
        var rect = ov.getBoundingClientRect();
        var curX  = t0.clientX - rect.left;
        var delta = (curX - _panStartX) * (_panStartBwHz / V.W);
        var now   = Date.now();
        if (now - _lastPanMs >= PAN_THROTTLE) {
          panHz(_panStartCHz - delta);
          _lastPanMs = now;
        }
      }
    }
  }, { passive: false });

  ov.addEventListener('touchend', function(e) {
    e.preventDefault();
    if (e.touches.length === 0) {
      if (!_hasMoved) {
        // Hit-test: temporarily disable our overlay so elementFromPoint sees the real UI.
        // If the tap landed on an interactive element (button, input, etc.) forward it.
        ov.style.pointerEvents = 'none';
        var _under = document.elementFromPoint(_tapX, _tapY);
        ov.style.pointerEvents = 'auto';
        if (_under && _under !== ov && !_under.closest('#vsdr-root')) {
          _under.click();
        } else {
          // Tap in waterfall area — tune VFO to tapped frequency
          var rect = ov.getBoundingClientRect();
          var x = _tapX - rect.left;
          var hz = pxToHz(x);
          if (hz > 0) tuneHz(hz);
        }
      }
      _hasMoved     = false;
      _pinchDist0   = 0;
      _pinchBinBw0  = 0;
      _pinchPivotHz = 0;
    } else if (e.touches.length === 1) {
      // One finger lifted during pinch — switch to pan mode from current position
      _pinchDist0 = 0;
      var rect = ov.getBoundingClientRect();
      var t0 = e.touches[0];
      _panStartX   = t0.clientX - rect.left;
      _panStartCHz = V.centerHz;
      _panStartBwHz = V.bwHz;
      _hasMoved = true;  // already moved — don't fire tap
    }
  }, { passive: false });
}

// ── Init ──────────────────────────────────────────────────────────────────
function init() {
  var ov = document.getElementById('vsdr-ov');
  if (!ov) return;
  V.ov  = ov;
  V.ctx = ov.getContext('2d');

  // Load saved preferences
  try {
    var savedCmap = localStorage.getItem('vsdr_cmap');
    if (savedCmap) V.cmapName = savedCmap;
    // (no per-session fps pref — rate is controlled by UberSDR's server buttons)
  } catch(e) {}

  if (!initGL()) {
    // WebGL unavailable — waterfall won't render but overlay still works
    console.warn('vsdr: WebGL unavailable');
  }

  onResize();
  window.addEventListener('resize', onResize);

  // Hook integrations after a delay (let UberSDR skin finish initialising)
  // hookZoom must run early — before the waterstream WebSocket reconnects
  hookZoom();
  hookTouches();

  buildSpectrumPanel();

  setTimeout(function() {
    hookFpsButtons();
    buildPaletteUI();
    hookSources();
  }, 500);

  // Keep trying to hook sources until connected
  var _hookInterval = setInterval(function() {
    if (V.hooked) { clearInterval(_hookInterval); return; }
    hookSources();
  }, 1000);

  requestAnimationFrame(frame);
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  setTimeout(init, 0);
}

})();`;
