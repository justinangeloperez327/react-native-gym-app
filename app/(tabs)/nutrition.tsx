import { Text, View } from 'react-native';
import { Page, Panel, ScreenHeader, SectionTitle } from '@/src/components/ui';
import { useAppTheme } from '@/src/theme/colors';

export default function NutritionScreen() {
  const { colors } = useAppTheme();
  return (
    <Page>
      <ScreenHeader title="Nutrition" subtitle="Food, hydration, and daily targets" />
      <Panel>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
          Nutrition logging is coming
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
          The meal diary, personal foods, recipes, calorie and macro targets,
          and water intake are scheduled for Groups 10 and 11.
          This screen does not calculate or save nutrition values yet.
        </Text>
      </Panel>
      <View style={{ gap: 10 }}>
        <SectionTitle>Planned tools</SectionTitle>
        {[
          ['Meal diary', 'Meals, portions and daily food totals'],
          ['Calorie and macro targets', 'Personal daily nutrition goals'],
          ['Hydration', 'Water intake and daily summaries'],
        ].map(([title, detail]) => (
          <Panel key={title}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>{title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{detail}</Text>
          </Panel>
        ))}
      </View>
    </Page>
  );
}
