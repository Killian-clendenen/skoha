// Knowledge base per starter opening. Only standard theory and well-known, verifiable games.
export const KB = {
  reti: {
    tagline: 'Hypermodern control: attack the centre from a distance.',
    overview: 'The Réti (1.Nf3 followed by c4 and/or g3) lets Black occupy the centre and then undermines it with flank pawns and fianchettoed bishops. It is a flexible system that can transpose to the English, Catalan, King\'s Indian Attack or even Queen\'s Gambit structures, so you can steer the game toward positions you know.',
    history: 'Named after Richard Réti, a leader of the hypermodern school of the 1920s along with Aron Nimzowitsch. Réti\'s best-known win with it was against José Raúl Capablanca at New York 1924, Capablanca\'s first loss in eight years. Later, Vladimir Kramnik and Magnus Carlsen used 1.Nf3 regularly, and Bobby Fischer used the King\'s Indian Attack setup often.',
    ideas: ['c4 attacks d5 from the flank. Against ...d4 you get a reversed Benoni, a tempo up.', 'Fianchettoes on g2 (and often b2) rake the long diagonals toward Black\'s queenside and centre.', 'Keep d2-d4 or e2-e4 in reserve. Breaking with the centre pawns at the right moment is the art of the opening.', 'In the King\'s Indian Attack (g3, d3, Nbd2, e4), White gains space with e4-e5 and attacks on the kingside with h4, Nf1-h2-g4 and Bf4.'],
    structures: ['Reversed Benoni (Black pawn on d4): undermine it with e3 and b4, and use the e-file and the long diagonal.', 'Hanging pawns on c5/d5 after cxd5 exd5: pressure them with d4, Rc1, Rfd1 and Qc2. Black wants ...d4 or ...c4 to activate them.', 'KIA vs French setup (White pawns d3/e5, Black pawns c5/d5/e6): White attacks the kingside, Black storms the queenside with ...b5-b4 and ...a5-a4.'],
    plansWhite: ['Double fianchetto with b3/Bb2, e3 and Nc3, then cxd5 or d4 at the right moment.', 'Against ...d4: play e3 or b4 to undermine the pawn, using Re1 and Bf4.', 'Against ...dxc4: regain it with Qa4+, Na3xc4 or e3/Bxc4.', 'KIA: e4, Re1, e5, Nf1, h4, Bf4 and N1h2-g4.'],
    plansBlack: ['Solid ...d5/...e6/...c5 and ...Nc6, aiming for free piece play.', 'Slav setup with ...c6 and ...Bf5 or ...Bg4: develop the bishop outside the chain.', 'Gain space with ...d4 and ...e5, but watch the e3 and b4 levers.', 'Against the KIA: ...c5, ...Nc6, ...b5-b4 and ...a5-a4 on the queenside.'],
    traps: ['After 1.Nf3 d5 2.c4 dxc4, White doesn\'t need to rush. Qa4+ or e3/Bxc4 regain the pawn, and trying to hold it with ...b5 weakens Black\'s queenside (a4 hits b5).', 'Dutch (1...f5): 2.d3 and 3.e4 open the e8–h5 diagonal. After ...e5, Bc4 and Ng5 threaten Nf7, forking queen and rook, because the king can\'t recapture under the c4-bishop\'s fire.', 'In the KIA, if Black plays ...b5 slowly, e4-e5 followed by the h4/Ng5 and Qg4 attack can come fast against an under-defended king.'],
    games: ['Réti vs Capablanca, New York 1924 (1–0): the famous hypermodern victory.', 'Fischer vs Myagmarsuren, Sousse Interzonal 1967 (1–0): the model King\'s Indian Attack kingside attack.'],
    tips: ['Learn the move-order tricks. You can reach the same position via c4 or g3 first, so pick the one that avoids your opponent\'s favourite system.', 'Don\'t be in a hurry to take on d5. Often the tension is your best friend.', 'Use the Pick-a-line mode to review each chapter, then let spaced repetition do the rest.']
  },
  italian: {
    tagline: 'Classical development and a slow-burning attack on f7.',
    overview: 'The Italian (1.e4 e5 2.Nf3 Nc6 3.Bc4) develops quickly and aims at f7. The modern "Giuoco Pianissimo" with c3 and d3 is a slow manoeuvring game where White prepares d4 and a kingside build-up with Nbd2-f1-g3.',
    history: 'One of the oldest openings, analysed by Greco in the 17th century. It was revived at elite level in the 2010s as a less drawish alternative to the Ruy Lopez Berlin, and players like Carlsen, Caruana and Giri adopted c3/d3 setups.',
    ideas: ['The bishop on c4 eyes f7, the weakest square in Black\'s camp.', 'c3 prepares d4 and gives the bishop a retreat to a2 or b3 (after a4 it can drop back to a2).', 'h3 and a4 are prophylactic: they stop ...Bg4/...Ng4 and ...b5.', 'The knight manoeuvre Nb1-d2-f1-g3 heads for f5 or h5.'],
    structures: ['Symmetrical e4/d3 vs e5/d6, a manoeuvring battle.', 'Black\'s ...Be6 and Bxe6 fxe6 gives Black a half-open f-file and central control, but the e6 pawn can become a target.', 'Open centre after d4 exd4 cxd4: White\'s big centre against Black\'s piece pressure (for example ...Bb4+ or ...Bb6).'],
    plansWhite: ['Re1, h3, a4, Nbd2-f1-g3 and then d4 or Nh4-f5.', 'With the d4 break: a full centre and gains of time on Black\'s pieces.'],
    plansBlack: ['...a6/...Ba7, ...h6 and ...Be6 to trade the c4-bishop.', 'A timely ...d5 break when White is slow.', '...Na5 to hunt the light-squared bishop.'],
    traps: ['Fried Liver idea: in the Two Knights after 4.Ng5 d5 5.exd5, 5...Nxd5? allows 6.Nxf7!, a dangerous sacrifice. That is why 5...Na5 is the main line.', 'After ...Bc5, a2-a4-a5 can trap or misplace a bishop on b6.'],
    games: ['Steinitz vs von Bardeleben, Hastings 1895 (1–0): a famous Giuoco Piano attacking game.'],
    tips: ['Don\'t rush d4. Get castled and play h3 and a4 first.', 'If Black plays ...d5, be ready to answer exd5 Nxd5 with Re1, hitting e5.']
  },
  london: {
    tagline: 'A rock-solid system you can play against almost anything.',
    overview: 'The London (1.d4 followed by Bf4, e3, c3, Nf3, Nbd2 and Bd3) puts the dark-squared bishop outside the pawn chain. It is a low-theory system with clear plans: Ne5 and f4, or a kingside attack with Bd3 and Qf3/h4.',
    history: 'An old system that became popular at the London 1922 tournament. It was revived at top level in the 2010s by players such as Gata Kamsky and Magnus Carlsen.',
    ideas: ['Develop the bishop to f4 before e3.', 'Keep Bg3 ready to meet ...Bd6. If ...Bxg3, hxg3 opens the h-file.', 'Ne5, supported by f4 (a Stonewall-like setup), is a key outpost.', 'Watch b2: ...Qb6 is Black\'s typical response, met by Qb3 or Qc1.'],
    structures: ['The c3-d4-e3 pyramid against ...c5/...d5/...e6.', 'Against the King\'s Indian, h3 and Be2 keep it compact.'],
    plansWhite: ['Ne5, f4, Qf3, and g4 or h4 on the kingside.', 'Queenside expansion with a4 against ...b6.'],
    plansBlack: ['...c5, ...Nc6, ...Qb6 hitting b2 and d4.', '...Bd6 to trade the f4-bishop.', '...c4 to gain queenside space.'],
    traps: ['Don\'t ignore ...Qb6. If b2 is left hanging, Black grabs it with tempo, so answer with Qb3 or Qc1.', 'If Black plays ...Bf5 early, Qb3 can hit b7.'],
    games: [],
    tips: ['Play the same setup every game, but watch for ...Qb6.', 'When Black plays ...Bd6, answer with Bg3.']
  },
  carokann: {
    tagline: 'Solid as granite, with active pieces.',
    overview: 'The Caro-Kann (1.e4 c6 2.d4 d5) keeps a solid pawn structure and develops the light-squared bishop before ...e6. It is one of the most reliable defences to 1.e4.',
    history: 'Named after Horatio Caro and Marcus Kann, who analysed it in the 1880s. World Champions Botvinnik, Petrosian and Karpov played it regularly.',
    ideas: ['...c6 supports ...d5 without locking in the c8-bishop.', 'In the Classical: ...Bf5, ...Bg6, ...h6 and ...Nd7.', 'Against the Advance: ...Bf5, ...e6, ...c5 and ...Nc6.'],
    structures: ['Classical: White has more space, Black is solid.', 'Advance: a French-like chain where Black hits d4.', 'Exchange: the Carlsbad structure.'],
    plansWhite: ['Classical: h4-h5, O-O-O.', 'Advance: g4 and Nf4, hunting the bishop.'],
    plansBlack: ['Classical: ...Nd7, ...Ngf6, ...e6, ...Be7 and ...O-O or ...O-O-O.', 'Advance: ...c5 and ...Nc6.'],
    traps: ['After 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7 5.Qe2, 5...Ngf6?? 6.Nd6# is a smothered mate.'],
    games: ['Deep Blue vs Kasparov, game 6, 1997 (1–0): a Caro-Kann Karpov line where 7...h6? allowed the 8.Nxe6 sacrifice. A lesson in move-order precision.'],
    tips: ['Don\'t let White trap your bishop with h4-h5.', 'Against the Advance, hit d4 with ...c5.']
  },
  qgd: {
    tagline: 'Classical solidity against 1.d4.',
    overview: 'The Queen\'s Gambit Declined (1.d4 d5 2.c4 e6) holds d5 with ...e6. It is one of the most solid replies to 1.d4.',
    history: 'Played for well over a century. Most games of the 1927 World Championship match between Capablanca and Alekhine were Queen\'s Gambit Declined.',
    ideas: ['Hold d5 with ...e6, then free your game with ...c5 or ...dxc4.', 'The Tartakower ...b6/...Bb7 solves the problem of the c8-bishop.'],
    structures: ['Carlsbad: White plays a minority attack.', 'Hanging pawns.'],
    plansWhite: ['A minority attack with b4-b5.', 'Bg5 pins.'],
    plansBlack: ['...c5 breaks.', '...b6 and ...Bb7.'],
    traps: ['The Elephant Trap: 1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 Nbd7 5.cxd5 exd5 6.Nxd5?? Nxd5! 7.Bxd8 Bb4+ 8.Qd2 Bxd2+ 9.Kxd2 Kxd8, and Black wins a piece.'],
    games: ['Capablanca vs Alekhine, World Championship 1927: most games were QGDs.'],
    tips: ['Don\'t fear the minority attack.', 'Remember the Elephant Trap.']
  }
};
