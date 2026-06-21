import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password || password.length < 12) {
  console.error('Bruk: npm run hash:password -- "DittSterkePassord123!"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);
